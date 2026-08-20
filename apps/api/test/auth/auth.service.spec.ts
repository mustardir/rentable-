import * as bcrypt from 'bcryptjs';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('AuthService (unit)', () => {
  let service: AuthService;
  let prisma: any;
  let users: Map<string, any>;
  let sessions: Map<string, any>;
  let refreshTokens: Map<string, any>;
  let sequence: number;

  beforeEach(() => {
    sequence = 0;
    users = new Map();
    sessions = new Map();
    refreshTokens = new Map();

    const nextId = (prefix: string) => `${prefix}-${++sequence}`;

    prisma = {
      user: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.email) return [...users.values()].find((user) => user.email === where.email) ?? null;
          return users.get(where.id) ?? null;
        }),
        create: jest.fn(async ({ data }: any) => {
          const user = {
            id: nextId('user'),
            email: data.email,
            passwordHash: data.passwordHash,
            role: 'USER',
            isActive: true,
          };
          users.set(user.id, user);
          return user;
        }),
      },
      session: {
        create: jest.fn(async ({ data }: any) => {
          const session = {
            id: nextId('session'),
            ...data,
            revokedAt: null,
          };
          sessions.set(session.id, session);
          return session;
        }),
        findUnique: jest.fn(async ({ where }: any) => sessions.get(where.id) ?? null),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const session of sessions.values()) {
            if (session.id === where.id && (!where.revokedAt || session.revokedAt === where.revokedAt)) {
              Object.assign(session, data);
              count++;
            }
          }
          return { count };
        }),
      },
      refreshToken: {
        create: jest.fn(async ({ data }: any) => {
          const token = { ...data, revokedAt: null, replacedById: null };
          refreshTokens.set(token.id, token);
          return token;
        }),
        findUnique: jest.fn(async ({ where }: any) => refreshTokens.get(where.id) ?? null),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const token of refreshTokens.values()) {
            const sessionMatches = where.sessionId ? token.sessionId === where.sessionId : true;
            const idMatches = where.id ? token.id === where.id : true;
            const revokedMatches = where.revokedAt === null ? token.revokedAt === null : true;
            if (sessionMatches && idMatches && revokedMatches) {
              Object.assign(token, data);
              count++;
            }
          }
          return { count };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const token = refreshTokens.get(where.id);
          if (!token) throw new Error('Token not found');
          Object.assign(token, data);
          return token;
        }),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    const jwtService = {
      signAsync: jest.fn(async ({ sub }: { sub: string }) => `access-${sub}`),
    };

    service = new AuthService(prisma as PrismaService, jwtService as any);
  });

  it('registers a user successfully', async () => {
    const res = await service.register('unit@example.com', 'Password1', 'Unit');
    expect(res).toHaveProperty('id');
    expect(res.email).toBe('unit@example.com');
    const dbUser = await prisma.user.findUnique({ where: { email: 'unit@example.com' } });
    expect(dbUser.passwordHash).not.toBe('Password1');
    expect(await bcrypt.compare('Password1', dbUser.passwordHash)).toBe(true);
  });

  it('rejects duplicate registration', async () => {
    await service.register('dup@example.com', 'Password1', 'Dup');
    await expect(service.register('dup@example.com', 'Password1', 'Dup')).rejects.toThrow();
  });

  it('enforces password policy', async () => {
    await expect(service.register('weak@example.com', 'short', 'Weak')).rejects.toThrow();
  });

  it('validates login correctly and rejects inactive users', async () => {
    await service.register('login@example.com', 'Password1', 'Login');
    const okUser = await service.validateUser('login@example.com', 'Password1');
    expect(okUser).not.toBeNull();

    const badUser = await service.validateUser('login@example.com', 'WrongPass');
    expect(badUser).toBeNull();

    const user = [...users.values()][0];
    user.isActive = false;
    expect(await service.validateUser('login@example.com', 'Password1')).toBeNull();
  });

  it('logs in, rotates refresh tokens, and rejects reuse', async () => {
    await service.register('rot@example.com', 'Password1', 'Rot');
    const login = await service.login('rot@example.com', 'Password1');
    expect(login.accessToken).toMatch(/^access-/);
    expect(login.refreshToken).toBeTruthy();

    const r1 = await service.refresh(login.refreshToken);
    expect(r1).toHaveProperty('accessToken');
    expect(r1).toHaveProperty('refreshToken');
    expect(r1.refreshToken).not.toBe(login.refreshToken);

    await expect(service.refresh(login.refreshToken)).rejects.toThrow('Refresh token reuse detected');
    await expect(service.refresh(r1.refreshToken)).rejects.toThrow('Session expired');
  });

  it('logs out the entire session', async () => {
    await service.register('logout@example.com', 'Password1', 'Logout');
    const login = await service.login('logout@example.com', 'Password1');
    await expect(service.logout(login.refreshToken)).resolves.toEqual({ success: true });
    await expect(service.refresh(login.refreshToken)).rejects.toThrow('Refresh token reuse detected');
  });
});
