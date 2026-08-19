import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { JWT_REFRESH_SECRET, REFRESH_TOKEN_EXPIRES_IN } from './constants';
import { validatePasswordPolicy } from './password-policy';
import * as jwt from 'jsonwebtoken';

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
    const user = await this.prisma.user.create({ data: { email, passwordHash, profile: { create: { firstName: name ?? '' } } } });

    return { id: user.id, email: user.email };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    const { passwordHash, ...safe } = user as any;
    return safe;
  }

  private signAccessToken(userId: string) {
    return this.jwtService.signAsync({ sub: userId });
  }

  private parseExpiryMs(spec: string) {
    if (/^\d+m$/.test(spec)) {
      const m = parseInt(spec.slice(0, -1), 10);
      return m * 60 * 1000;
    }
    if (/^\d+d$/.test(spec)) {
      const d = parseInt(spec.slice(0, -1), 10);
      return d * 24 * 60 * 60 * 1000;
    }
    return 30 * 24 * 60 * 60 * 1000;
  }

  private async createAndStoreRefreshToken(userId: string, sessionId?: string, tx?: any): Promise<{ refreshJwt: string; tokenId: string }> {
    const tokenId = randomUUID();
    const payload = { sub: userId };
    const refreshJwt = jwt.sign(payload, JWT_REFRESH_SECRET, { jwtid: tokenId, expiresIn: REFRESH_TOKEN_EXPIRES_IN });
    const tokenHash = await bcrypt.hash(refreshJwt, 12);

    const expiresAt = new Date(Date.now() + this.parseExpiryMs(REFRESH_TOKEN_EXPIRES_IN));

    const client = tx ?? this.prisma;

    await client.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        sessionId: sessionId ?? undefined,
        tokenHash,
        expiresAt,
      },
    });

    return { refreshJwt, tokenId };
  }

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    // session expiry aligned to refresh token expiry by default
    const sessionExpiryMs = this.parseExpiryMs(process.env.SESSION_EXPIRES || REFRESH_TOKEN_EXPIRES_IN);

    const session = await this.prisma.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + sessionExpiryMs), ipAddress: ip, userAgent } });

    const accessToken = await this.signAccessToken(user.id);
    const { refreshJwt } = await this.createAndStoreRefreshToken(user.id, session.id);

    return { accessToken, refreshToken: refreshJwt, user: { id: user.id, email: user.email } };
  }

  async refresh(oldRefreshJwt: string) {
    try {
      // Atomic rotation inside a single transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const decoded = jwt.verify(oldRefreshJwt, JWT_REFRESH_SECRET) as any;
        const tokenId = decoded?.jti;
        if (!tokenId) throw new UnauthorizedException('Invalid token');

        const dbToken = await tx.refreshToken.findUnique({ where: { id: tokenId } });
        if (!dbToken) throw new UnauthorizedException('Invalid token');
        if (dbToken.revokedAt) throw new UnauthorizedException('Token revoked');
        if (dbToken.expiresAt && dbToken.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Token expired');

        const match = await bcrypt.compare(oldRefreshJwt, dbToken.tokenHash);
        if (!match) throw new UnauthorizedException('Invalid token');

        // create new refresh token within same transaction
        const { refreshJwt: newRefresh, tokenId: newTokenId } = await this.createAndStoreRefreshToken(dbToken.userId, dbToken.sessionId ?? undefined, tx);

        // mark the old token revoked and replaced
        await tx.refreshToken.update({ where: { id: dbToken.id }, data: { replacedById: newTokenId, revokedAt: new Date() } });

        const accessToken = await this.signAccessToken(dbToken.userId);
        return { accessToken, refreshToken: newRefresh };
      });

      return result;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async logout(refreshJwt?: string) {
    if (!refreshJwt) return;
    try {
      const decoded = jwt.verify(refreshJwt, JWT_REFRESH_SECRET) as any;
      const tokenId = decoded?.jti;
      if (!tokenId) return;
      await this.prisma.refreshToken.updateMany({ where: { id: tokenId }, data: { revokedAt: new Date() } });
    } catch (err) {
      // swallow to avoid leaking
    }
  }
}
