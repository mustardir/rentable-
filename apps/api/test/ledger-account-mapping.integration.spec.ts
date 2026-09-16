import { PrismaClient, AccountType, Direction, UserRole } from '@prisma/client';
import { LedgerAccountMappingService } from '../src/ledger/ledger-account-mapping.service';

const prisma = new PrismaClient();
const DATABASE_URL = process.env.DATABASE_URL;
const describePrisma = DATABASE_URL ? describe : describe.skip;

describePrisma('Ledger account mapping provisioning (PostgreSQL)', () => {
  const prefix = `ledger-mapping-${Date.now()}-${process.pid}`;
  let service: LedgerAccountMappingService;
  let accountId: string;
  let superAdminId: string;

  beforeAll(async () => {
    service = new LedgerAccountMappingService(prisma as never);

    const account = await prisma.account.create({
      data: {
        code: `${Date.now()}1100`,
        name: 'Investor Cash Mapping Test',
        type: AccountType.ASSET,
        normalBalance: Direction.DEBIT,
      },
    });
    accountId = account.id;

    const actor = await prisma.user.create({
      data: {
        email: `${prefix}-admin@example.com`,
        passwordHash: 'test-hash',
        role: UserRole.SUPER_ADMIN,
      },
    });
    superAdminId = actor.id;
  });

  afterAll(async () => prisma.$disconnect());

  it('provisions an explicit USD mapping and normalizes currency', async () => {
    const investor = await prisma.user.create({
      data: {
        email: `${prefix}-usd@example.com`,
        passwordHash: 'test-hash',
        role: UserRole.INVESTOR,
      },
    });

    const mapping = await service.provision({
      actorId: superAdminId,
      userId: investor.id,
      accountId,
      currency: ' usd ',
    });

    expect(mapping.userId).toBe(investor.id);
    expect(mapping.accountId).toBe(accountId);
    expect(mapping.currency).toBe('USD');
    expect(mapping.isActive).toBe(true);
  });

  it('allows a second currency for the same investor', async () => {
    const investor = await prisma.user.create({
      data: {
        email: `${prefix}-multi@example.com`,
        passwordHash: 'test-hash',
        role: UserRole.INVESTOR,
      },
    });

    const usd = await service.provision({ actorId: superAdminId, userId: investor.id, accountId, currency: 'USD' });
    const eur = await service.provision({ actorId: superAdminId, userId: investor.id, accountId, currency: 'EUR' });

    expect(usd.currency).toBe('USD');
    expect(eur.currency).toBe('EUR');
  });

  it('rejects a duplicate active mapping for the same investor and currency', async () => {
    const investor = await prisma.user.create({
      data: {
        email: `${prefix}-duplicate@example.com`,
        passwordHash: 'test-hash',
        role: UserRole.INVESTOR,
      },
    });

    await service.provision({ actorId: superAdminId, userId: investor.id, accountId, currency: 'USD' });

    await expect(service.provision({
      actorId: superAdminId,
      userId: investor.id,
      accountId,
      currency: 'USD',
    })).rejects.toThrow('LEDGER_MAPPING_ALREADY_EXISTS');
  });

  it('rejects an inactive provisioning actor', async () => {
    const actor = await prisma.user.create({
      data: {
        email: `${prefix}-inactive-admin@example.com`,
        passwordHash: 'test-hash',
        role: UserRole.SUPER_ADMIN,
        isActive: false,
      },
    });
    const investor = await prisma.user.create({
      data: {
        email: `${prefix}-inactive-actor-target@example.com`,
        passwordHash: 'test-hash',
        role: UserRole.INVESTOR,
      },
    });

    await expect(service.provision({
      actorId: actor.id,
      userId: investor.id,
      accountId,
      currency: 'USD',
    })).rejects.toThrow('PROVISIONING_ACTOR_NOT_AUTHORIZED');
  });

  it('rejects non-investor targets', async () => {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-operator-target@example.com`,
        passwordHash: 'test-hash',
        role: UserRole.PORTFOLIO_MANAGER,
      },
    });

    await expect(service.provision({
      actorId: superAdminId,
      userId: user.id,
      accountId,
      currency: 'USD',
    })).rejects.toThrow('LEDGER_MAPPING_REQUIRES_INVESTOR');
  });

  it('rejects an inactive ledger account', async () => {
    const investor = await prisma.user.create({
      data: {
        email: `${prefix}-inactive-account@example.com`,
        passwordHash: 'test-hash',
        role: UserRole.INVESTOR,
      },
    });
    const account = await prisma.account.create({
      data: {
        code: `${Date.now()}2200`,
        name: 'Inactive Mapping Test',
        type: AccountType.ASSET,
        normalBalance: Direction.DEBIT,
        isActive: false,
      },
    });

    await expect(service.provision({
      actorId: superAdminId,
      userId: investor.id,
      accountId: account.id,
      currency: 'USD',
    })).rejects.toThrow('LEDGER_MAPPING_ACCOUNT_NOT_FOUND');
  });
});
