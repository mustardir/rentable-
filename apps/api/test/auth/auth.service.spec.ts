import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('AuthService (unit)', () => {
  let service: AuthService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, PrismaService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    // cleanup created users and tokens
    await prisma.refreshToken.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it('registers a user successfully', async () => {
    const res = await service.register('unit@example.com', 'Password1', 'Unit');
    expect(res).toHaveProperty('id');
    expect(res.email).toBe('unit@example.com');
    const dbUser = await prisma.user.findUnique({ where: { email: 'unit@example.com' } });
    expect(dbUser).toBeDefined();
    expect(dbUser?.passwordHash).toBeDefined();
    expect(dbUser?.passwordHash).not.toBe('Password1');
  });

  it('rejects duplicate registration', async () => {
    await service.register('dup@example.com', 'Password1', 'Dup');
    await expect(service.register('dup@example.com', 'Password1', 'Dup')).rejects.toThrow();
  });

  it('enforces password policy', async () => {
    await expect(service.register('weak@example.com', 'short', 'Weak')).rejects.toThrow();
  });

  it('validates login correctly', async () => {
    await service.register('login@example.com', 'Password1', 'Login');
    const okUser = await service.validateUser('login@example.com', 'Password1');
    expect(okUser).not.toBeNull();
    const badUser = await service.validateUser('login@example.com', 'WrongPass');
    expect(badUser).toBeNull();
  });

  it('refresh rotates and revokes old token (unit-level)', async () => {
    await service.register('rot@example.com', 'Password1', 'Rot');
    const login = await service.login('rot@example.com', 'Password1');
    const refreshToken = login.refreshToken;
    const r1 = await service.refresh(refreshToken);
    expect(r1).toHaveProperty('accessToken');
    expect(r1).toHaveProperty('refreshToken');
    await expect(service.refresh(refreshToken)).rejects.toThrow();
  });
});
