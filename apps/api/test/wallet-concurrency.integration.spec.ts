import { PrismaClient, AccountType, Direction, EntryStatus, TransactionStatus, TransactionType, UserRole } from '@prisma/client';
import { WalletService } from '../src/wallet/wallet.service';

const prisma = new PrismaClient();
const DATABASE_URL = process.env.DATABASE_URL;
const describePrisma = DATABASE_URL ? describe : describe.skip;

const INVESTOR_CASH_ACCOUNT_ID = 'acct_1100';
const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';

describePrisma('Fortress Wallet Concurrency (PostgreSQL)', () => {
  const prefix = `wallet-concurrency-${Date.now()}-${process.pid}`;
  const investorId = `${prefix}-investor`;
  const operatorId = `${prefix}-operator`;
  const withdrawalA = `${prefix}-withdrawal-a`;
  const withdrawalB = `${prefix}-withdrawal-b`;

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
        { id: investorId, email: `${investorId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.INVESTOR },
        { id: operatorId, email: `${operatorId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.SUPER_ADMIN },
      ],
    });

    await prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-initial-funding`,
        reference: `${prefix}-initial-funding-ref`,
        description: 'Initial USD funding for wallet concurrency test',
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
              metadata: { investorId, funding: true },
            },
          ],
        },
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          id: withdrawalA,
          userId: investorId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.PENDING,
          amountKobo: 10000n,
          currency: 'USD',
          reference: `${prefix}-withdrawal-a-ref`,
          idempotencyKey: `${prefix}-withdrawal-a-key`,
          metadata: { workflow: 'customer_withdrawal' },
        },
        {
          id: withdrawalB,
          userId: investorId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.PENDING,
          amountKobo: 10000n,
          currency: 'USD',
          reference: `${prefix}-withdrawal-b-ref`,
          idempotencyKey: `${prefix}-withdrawal-b-key`,
          metadata: { workflow: 'customer_withdrawal' },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows only one of two concurrent withdrawals to spend the exact same USD balance', async () => {
    const service = new WalletService(prisma as any, {
      append: jest.fn().mockResolvedValue(undefined),
      appendInTransaction: jest.fn().mockResolvedValue(undefined),
    } as any);

    const initialLines = await prisma.journalLine.findMany({
      where: {
        accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
        metadata: { path: ['investorId'], equals: investorId },
        journalEntry: { status: EntryStatus.POSTED, currency: 'USD' },
      },
      select: { direction: true, amountKobo: true },
    });
    const initialBalance = initialLines.reduce(
      (balance, line) => balance + (line.direction === Direction.CREDIT ? line.amountKobo : -line.amountKobo),
      0n,
    );
    expect(initialBalance).toBe(10000n);

    const results = await Promise.allSettled([
      service.confirmRequest(withdrawalA, operatorId),
      service.confirmRequest(withdrawalB, operatorId),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    if (fulfilled.length !== 1 || rejected.length !== 1) {
      const reasons = results.map((result) =>
        result.status === 'rejected'
          ? { status: result.status, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }
          : { status: result.status },
      );
      throw new Error(`Unexpected concurrent wallet outcomes: ${JSON.stringify(reasons)}`);
    }

    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('Insufficient available balance');

    const transactions = await prisma.transaction.findMany({
      where: { id: { in: [withdrawalA, withdrawalB] } },
      orderBy: { id: 'asc' },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions.filter((transaction) => transaction.status === TransactionStatus.COMPLETED)).toHaveLength(1);
    expect(transactions.filter((transaction) => transaction.status === TransactionStatus.PENDING)).toHaveLength(1);

    const sourceLines = await prisma.journalLine.findMany({
      where: {
        accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
        metadata: { path: ['investorId'], equals: investorId },
        journalEntry: { status: EntryStatus.POSTED, currency: 'USD' },
      },
      select: { direction: true, amountKobo: true },
    });

    const availableKobo = sourceLines.reduce(
      (balance, line) => balance + (line.direction === Direction.CREDIT ? line.amountKobo : -line.amountKobo),
      0n,
    );
    expect(availableKobo).toBe(0n);

    const postedWithdrawals = await prisma.journalEntry.count({
      where: {
        idempotencyKey: { in: [`wallet:${prefix}-withdrawal-a-key`, `wallet:${prefix}-withdrawal-b-key`] },
        status: EntryStatus.POSTED,
      },
    });
    expect(postedWithdrawals).toBe(1);
  });
});
