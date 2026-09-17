import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccountType, Direction, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Ledger account mapping HTTP integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  let accountId: string;
  let investorId: string;
  let superAdminToken: string;
  let complianceToken: string;
  let investorToken: string;
  let portfolioManagerToken: string;
  let treasuryManagerToken: string;

  const password = 'Fortress-Test-Password-2026!';
  const dbAvailable = Boolean(process.env.DATABASE_URL);

  async function createUser(role: UserRole, suffix: string) {
    const user = await prisma.user.create({
      data: {
        email: `ledger-mapping-http-${suffix}-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash(password, 4),
        role,
        isActive: true,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.accessToken as string;
  }

  beforeAll(async () => {
    if (!dbAvailable) return;

    process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-access-secret';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'integration-test-refresh-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const account = await prisma.account.create({
      data: {
        code: `9900-${Date.now()}`,
        name: 'HTTP mapping integration test account',
        type: AccountType.ASSET,
        normalBalance: Direction.DEBIT,
        isActive: true,
      },
    });
    accountId = account.id;

    const superAdmin = await createUser(UserRole.SUPER_ADMIN, 'super-admin');
    const compliance = await createUser(UserRole.COMPLIANCE_OFFICER, 'compliance');
    const investor = await createUser(UserRole.INVESTOR, 'investor');
    const portfolioManager = await createUser(UserRole.PORTFOLIO_MANAGER, 'portfolio-manager');
    const treasuryManager = await createUser(UserRole.TREASURY_MANAGER, 'treasury-manager');
    investorId = investor.id;

    superAdminToken = await login(superAdmin.email);
    complianceToken = await login(compliance.email);
    investorToken = await login(investor.email);
    portfolioManagerToken = await login(portfolioManager.email);
    treasuryManagerToken = await login(treasuryManager.email);
  });

  afterAll(async () => {
    if (!dbAvailable || !prisma) return;

    await prisma.userLedgerAccount.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    if (accountId) {
      await prisma.account.delete({ where: { id: accountId } });
    }
    await app.close();
  });

  it('creates and persists a normalized USD mapping for SUPER_ADMIN', async () => {
    if (!dbAvailable) return;

    const response = await request(app.getHttpServer())
      .post('/api/ledger/accounts/mappings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ userId: investorId, accountId, currency: ' usd ' })
      .expect(201);

    expect(response.body.userId).toBe(investorId);
    expect(response.body.accountId).toBe(accountId);
    expect(response.body.currency).toBe('USD');
    expect(response.body.isActive).toBe(true);

    const persisted = await prisma.userLedgerAccount.findUnique({
      where: {
        userId_accountId_currency: {
          userId: investorId,
          accountId,
          currency: 'USD',
        },
      },
    });

    expect(persisted).not.toBeNull();
    expect(persisted?.currency).toBe('USD');
  });

  it('allows COMPLIANCE_OFFICER to provision another currency', async () => {
    if (!dbAvailable) return;

    const response = await request(app.getHttpServer())
      .post('/api/ledger/accounts/mappings')
      .set('Authorization', `Bearer ${complianceToken}`)
      .send({ userId: investorId, accountId, currency: 'EUR' })
      .expect(201);

    expect(response.body.currency).toBe('EUR');
  });

  it.each([
    ['INVESTOR', () => investorToken],
    ['PORTFOLIO_MANAGER', () => portfolioManagerToken],
    ['TREASURY_MANAGER', () => treasuryManagerToken],
  ])('rejects %s from provisioning a mapping', async (_role, tokenFactory) => {
    if (!dbAvailable) return;

    await request(app.getHttpServer())
      .post('/api/ledger/accounts/mappings')
      .set('Authorization', `Bearer ${tokenFactory()}`)
      .send({ userId: investorId, accountId, currency: 'GBP' })
      .expect(403);
  });

  it('rejects requests without a JWT', async () => {
    if (!dbAvailable) return;

    await request(app.getHttpServer())
      .post('/api/ledger/accounts/mappings')
      .send({ userId: investorId, accountId, currency: 'GBP' })
      .expect(401);
  });

  it('rejects an invalid currency at the HTTP boundary', async () => {
    if (!dbAvailable) return;

    await request(app.getHttpServer())
      .post('/api/ledger/accounts/mappings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ userId: investorId, accountId, currency: 'USDX' })
      .expect(400);
  });

  it('rejects a duplicate user-account-currency mapping', async () => {
    if (!dbAvailable) return;

    await request(app.getHttpServer())
      .post('/api/ledger/accounts/mappings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ userId: investorId, accountId, currency: 'USD' })
      .expect(409);
  });

  it('rejects an actorId override from the request body', async () => {
    if (!dbAvailable) return;

    const otherInvestor = await createUser(UserRole.INVESTOR, 'override-target');

    await request(app.getHttpServer())
      .post('/api/ledger/accounts/mappings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        actorId: otherInvestor.id,
        userId: investorId,
        accountId,
        currency: 'CAD',
      })
      .expect(400);
  });
});

// Keep PrismaClient referenced so the integration test fails fast at compile time if the
// generated client is unavailable after migrations/client generation.
void PrismaClient;
