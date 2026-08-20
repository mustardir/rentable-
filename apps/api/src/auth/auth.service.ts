import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { JWT_REFRESH_SECRET, REFRESH_TOKEN_EXPIRES_IN, assertJwtConfiguration } from './constants';
import { validatePasswordPolicy } from './password-policy';

// jsonwebtoken is intentionally loaded as untyped runtime code so the existing lockfile remains unchanged.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('jsonwebtoken');

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwtService: JwtService) {}

  async register(email: string, password: string, name?: string) {
    if (!validatePasswordPolicy(password)) {
      throw new BadRequestException('Password does not meet complexity requirements');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Registration failed');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: { create: { firstName: name ?? '' } },
      },
    });

    return { id: user.id, email: user.email };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;

    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  private signAccessToken(userId: string) {
    assertJwtConfiguration();
    return this.jwtService.signAsync({ sub: userId });
  }

  private parseExpiryMs(spec: string) {
    const match = /^(\d+)([mhd])$/.exec(spec);
    if (!match) return 30 * 24 * 60 * 60 * 1000;

    const value = Number(match[1]);
    if (match[2] === 'm') return value * 60 * 1000;
    if (match[2] === 'h') return value * 60 * 60 * 1000;
    return value * 24 * 60 * 60 * 1000;
  }

  private async createAndStoreRefreshToken(
    userId: string,
    sessionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ refreshJwt: string; tokenId: string }> {
    assertJwtConfiguration();

    const tokenId = randomUUID();
    const refreshJwt = jwt.sign(
      { sub: userId },
      JWT_REFRESH_SECRET,
      { jwtid: tokenId, expiresIn: REFRESH_TOKEN_EXPIRES_IN },
    );
    const tokenHash = await bcrypt.hash(refreshJwt, 12);
    const expiresAt = new Date(Date.now() + this.parseExpiryMs(REFRESH_TOKEN_EXPIRES_IN));
    const client = tx ?? this.prisma;

    await client.refreshToken.create({
      data: { id: tokenId, userId, sessionId, tokenHash, expiresAt },
    });

    return { refreshJwt, tokenId };
  }

  private async revokeSession(sessionId: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const sessionExpiryMs = this.parseExpiryMs(
      process.env.SESSION_EXPIRES || REFRESH_TOKEN_EXPIRES_IN,
    );

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + sessionExpiryMs),
        ipAddress: ip,
        userAgent,
      },
    });

    const accessToken = await this.signAccessToken(user.id);
    const { refreshJwt } = await this.createAndStoreRefreshToken(user.id, session.id);

    return {
      accessToken,
      refreshToken: refreshJwt,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async refresh(oldRefreshJwt: string) {
    assertJwtConfiguration();

    try {
      const decoded = jwt.verify(oldRefreshJwt, JWT_REFRESH_SECRET);
      const tokenId = decoded?.jti;
      if (!tokenId) throw new UnauthorizedException('Invalid token');

      const dbToken = await this.prisma.refreshToken.findUnique({ where: { id: tokenId } });
      if (!dbToken) throw new UnauthorizedException('Invalid token');

      if (dbToken.revokedAt) {
        if (dbToken.sessionId) await this.revokeSession(dbToken.sessionId);
        throw new UnauthorizedException('Refresh token reuse detected');
      }

      if (dbToken.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException('Token expired');
      }

      if (!dbToken.sessionId) throw new UnauthorizedException('Invalid session');

      const session = await this.prisma.session.findUnique({ where: { id: dbToken.sessionId } });
      if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException('Session expired');
      }

      const user = await this.prisma.user.findUnique({ where: { id: dbToken.userId } });
      if (!user || !user.isActive) throw new UnauthorizedException('User is inactive');

      const match = await bcrypt.compare(oldRefreshJwt, dbToken.tokenHash);
      if (!match) throw new UnauthorizedException('Invalid token');

      const result = await this.prisma.$transaction(async (tx) => {
        // Atomically claim the token. Only one concurrent refresh can win.
        const claimed = await tx.refreshToken.updateMany({
          where: { id: dbToken.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        if (claimed.count !== 1) return null;

        const { refreshJwt: newRefresh, tokenId: newTokenId } =
          await this.createAndStoreRefreshToken(dbToken.userId, dbToken.sessionId!, tx);

        await tx.refreshToken.update({
          where: { id: dbToken.id },
          data: { replacedById: newTokenId },
        });

        const accessToken = await this.signAccessToken(dbToken.userId);
        return { accessToken, refreshToken: newRefresh };
      });

      if (!result) {
        await this.revokeSession(dbToken.sessionId);
        throw new UnauthorizedException('Refresh token reuse detected');
      }

      return result;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid token');
    }
  }

  async logout(refreshJwt?: string) {
    if (!refreshJwt) return { success: true };

    try {
      assertJwtConfiguration();
      const decoded = jwt.verify(refreshJwt, JWT_REFRESH_SECRET);
      const tokenId = decoded?.jti;
      if (!tokenId) return { success: true };

      const token = await this.prisma.refreshToken.findUnique({ where: { id: tokenId } });
      if (!token) return { success: true };

      if (token.sessionId) {
        await this.revokeSession(token.sessionId);
      } else {
        await this.prisma.refreshToken.updateMany({
          where: { id: token.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch (_err) {
      // Logout is intentionally idempotent and does not reveal token validity.
    }

    return { success: true };
  }
}
