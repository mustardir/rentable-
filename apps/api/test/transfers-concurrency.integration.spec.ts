import { PrismaClient, EntryStatus, Direction, AccountType, UserRole } from '@prisma/client';
import { TransfersService } from '../src/transfers/transfers.service';

const prisma = new PrismaClient();
const DATABASE_URL = process.env.DATABASE_URL;
const describePrisma = DATABASE_URL ? describe : describe.skip;

const INVESTOR_CASH_ACCOUNT_ID = 'acct_1100';
const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';

describePrisma('Fortress Transfer Concurrency (PostgreSQL)', () => {
  const prefix = `transfer-concurrency-${Date.now()}-${process.pid}`;
  const sourceUserId = `${prefix}-source`;
  const destinationA = `${prefix}-destination-a`;
  const destinationB = `${prefix}-destination-b`;

  beforeAll(async () => {
    await prisma.account.upsert({
      where: { code: '1100' },
      update: {},
      create: {
        id: INVESTOR_CASH_ACCOUNT_ID,
        code: '1100',
        name: 'Investor Cash Test Account',
        type: AccountType.ASSET,
        normalBalance: Direction.DEBIT,
      },
    });

    await prisma.account.upsert({
      where: { code: '2100' },
      update: {},
      create: {
        id: CUSTOMER_DEPOSITS_ACCOUNT_ID,
        code: '2100',
        name: 'Customer Deposits Test Account',
        type: AccountType.LIABILITY,
        normalBalance: Direction.CREDIT,
      },
    });

    await prisma.user.createMany({
      data: [
        { id: sourceUserId, email: `${sourceUserId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.INVESTOR },
        { id: destinationA, email: `${destinationA}@test.invalid`, passwordHash: 'test-hash', role: UserRole.INVESTOR },
        { id: destinationB, email: `${destinationB}@test.invalid`, passwordHash: 'test-hash', role: UserRole.INVESTOR },
      ],
    });

    await prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-initial-funding`,
        reference: `${prefix}-initial-funding-ref`,
        description: 'Initial USD funding for concurrency test',
        currency: 'USD',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            {
              accountId: INVESTOR_CASH_ACCOUNT_ID,
              currency: 'USD',
              direction: Direction.DEBIT,
              amountKobo: 10000n,
            },
            {
              accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
              currency: 'USD',
              direction: Direction.CREDIT,
              amountKobo: 10000n,
              metadata: { investorId: sourceUserId, funding: true },
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows only one of two concurrent transfers to spend the exact same USD balance', async () => {
    const service = new TransfersService(prisma as any);

    const initialLines = await prisma.journalLine.findMany({
      where: {
        accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
        metadata: { path: ['investorId'], equals: sourceUserId },
        journalEntry: { status: EntryStatus.POSTED, currency: 'USD' },
      },
      select: { direction: true, amountKobo: true },
    });
    const initialBalance = initialLines.reduce(
      (balance, line) => balance + (line.direction === Direction.CREDIT ? line.amountKobo : -line.amountKobo),
      0n,
    );
    expect(initialBalance).toBe(10000n);

    const transferA = service.createTransfer({
      sourceUserId,
      destinationUserId: destinationA,
      amountKobo: '10000',
      idempotencyKey: `${prefix}-transfer-a`,
      reference: `${prefix}-transfer-a-ref`,
      currency: 'USD',
    });

    const transferB = service.createTransfer({
      sourceUserId,
      destinationUserId: destinationB,
      amountKobo: '10000',
      idempotencyKey: `${prefix}-transfer-b`,
      reference: `${prefix}-transfer-b-ref`,
      currency: 'USD',
    });

    const results = await Promise.allSettled([transferA, transferB]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    if (fulfilled.length !== 1 || rejected.length !== 1) {
      const reasons = results.map((result) =>
        result.status === 'rejected'
          ? { status: result.status, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }
          : { status: result.status },
      );
      throw new Error(`Unexpected concurrent transfer outcomes: ${JSON.stringify(reasons)}`);
    }

    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('Insufficient available balance');

    const transfers = await prisma.transfer.findMany({
      where: { idempotencyKey: { in: [`${prefix}-transfer-a`, `${prefix}-transfer-b`] } },
    });
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.status).toBe('COMPLETED');

    const sourceLines = await prisma.journalLine.findMany({
      where: {
        accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
        metadata: { path: ['investorId'], equals: sourceUserId },
        journalEntry: { status: EntryStatus.POSTED, currency: 'USD' },
      },
      select: { direction: true, amountKobo: true },
    });

    const availableKobo = sourceLines.reduce(
      (balance, line) => balance + (line.direction === Direction.CREDIT ? line.amountKobo : -line.amountKobo),
      0n,
    );
    expect(availableKobo).toBe(0n);
  });
});
