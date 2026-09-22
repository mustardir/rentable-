import { AccountType, Direction, EntryStatus, ProductStatus, ProductType, TransactionStatus, UserRole, PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaLedgerRepository } from '../src/ledger/prisma-ledger.repository';
import { InvestmentSubscriptionService } from '../src/financial-products/investment-subscription.service';

const prisma = new PrismaClient();
const describePrisma = process.env.DATABASE_URL ? describe : describe.skip;

describePrisma('Investment redemption concurrency and idempotency (PostgreSQL)', () => {
  const prefix = `investment-redemption-concurrency-${Date.now()}-${process.pid}`;
  const userId = `${prefix}-user`;
  const productId = `${prefix}-product`;
  const subscriptionId = `${prefix}-subscription`;
  const productCode = `${prefix}-code`;
  const subscriptionKey = `${prefix}-subscription-key`;
  const subscriptionReference = `${prefix}-subscription-ref`;
  const redemptionKey = `${prefix}-redemption-key`;
  const transactionKey = `INVEST-REDEEM-${redemptionKey}`;
  const positionEntryKey = `${prefix}-position`;
  const customerDepositsAccountId = 'acct_2100';
  const productObligationsAccountId = 'acct_2200';

  beforeAll(async () => {
    await prisma.account.upsert({
      where: { code: '2100' },
      update: {},
      create: { id: customerDepositsAccountId, code: '2100', name: 'Customer Deposits Test Account', type: AccountType.LIABILITY, normalBalance: Direction.CREDIT },
    });
    await prisma.account.upsert({
      where: { code: '2200' },
      update: {},
      create: { id: productObligationsAccountId, code: '2200', name: 'Product Obligations Test Account', type: AccountType.LIABILITY, normalBalance: Direction.CREDIT },
    });
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.INVESTOR },
    });
    await prisma.financialProduct.create({
      data: {
        id: productId,
        code: productCode,
        name: 'Redemption Concurrency Test Investment',
        type: ProductType.INVESTMENT,
        currency: 'USD',
        minimumAmountMinor: 5000n,
        status: ProductStatus.ACTIVE,
      },
    });
    await prisma.investmentSubscription.create({
      data: {
        id: subscriptionId,
        userId,
        productId,
        amountMinor: 5000n,
        currency: 'USD',
        status: 'COMPLETED',
        idempotencyKey: subscriptionKey,
        reference: subscriptionReference,
      },
    });
    await prisma.journalEntry.create({
      data: {
        idempotencyKey: positionEntryKey,
        reference: `${positionEntryKey}-ref`,
        description: 'Initial investment position for redemption concurrency test',
        currency: 'USD',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            {
              accountId: customerDepositsAccountId,
              currency: 'USD',
              direction: Direction.DEBIT,
              amountKobo: 5000n,
              metadata: { investorId: userId, source: 'test-funding' },
            },
            {
              accountId: productObligationsAccountId,
              currency: 'USD',
              direction: Direction.CREDIT,
              amountKobo: 5000n,
              metadata: { investorId: userId, subscriptionId, role: 'product-obligation' },
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { idempotencyKey: transactionKey } });
    // Journal entries are immutable by design and must remain append-only; do not delete test journal entries.
    await prisma.investmentSubscription.deleteMany({ where: { id: subscriptionId } });
    await prisma.financialProduct.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('converges concurrent identical redemption requests to one completed redemption', async () => {
    const prismaService = new PrismaService();
    await prismaService.$connect();
    const service = new InvestmentSubscriptionService(
      {} as never,
      {} as never,
      {} as never,
      prismaService,
      new PrismaLedgerRepository(prismaService),
    );

    try {
      const results = await Promise.allSettled([
        service.redeem(userId, subscriptionId, redemptionKey),
        service.redeem(userId, subscriptionId, redemptionKey),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      if (fulfilled.length !== 2 || rejected.length !== 0) {
        const outcomes = results.map((result) =>
          result.status === 'fulfilled'
            ? { status: result.status, subscriptionId: result.value.id, state: result.value.status }
            : { status: result.status, message: result.reason instanceof Error ? result.reason.message : String(result.reason) },
        );
        throw new Error(`Concurrent identical redemption did not converge: ${JSON.stringify(outcomes)}`);
      }

      const transactions = await prisma.transaction.findMany({
        where: { idempotencyKey: transactionKey },
        select: { id: true, type: true, status: true, amountKobo: true, currency: true, journalEntryId: true, investmentSubscriptionId: true },
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        type: 'REDEMPTION',
        status: TransactionStatus.COMPLETED,
        amountKobo: 5000n,
        currency: 'USD',
        journalEntryId: expect.any(String),
        investmentSubscriptionId: subscriptionId,
      });

      const journalEntries = await prisma.journalEntry.findMany({
        where: { idempotencyKey: transactionKey },
        include: { lines: true },
      });
      expect(journalEntries).toHaveLength(1);
      expect(journalEntries[0]?.status).toBe(EntryStatus.POSTED);
      expect(journalEntries[0]?.currency).toBe('USD');
      expect(journalEntries[0]?.lines).toHaveLength(2);

      const lines = journalEntries[0]?.lines ?? [];
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: productObligationsAccountId, direction: Direction.DEBIT, amountKobo: 5000n }),
          expect.objectContaining({ accountId: customerDepositsAccountId, direction: Direction.CREDIT, amountKobo: 5000n }),
        ]),
      );

      const positionLines = await prisma.journalLine.findMany({
        where: {
          accountId: productObligationsAccountId,
          currency: 'USD',
          metadata: { path: ['investorId'], equals: userId },
          journalEntry: { status: EntryStatus.POSTED },
        },
        select: { direction: true, amountKobo: true },
      });
      const position = positionLines.reduce(
        (total, line) => total + (line.direction === Direction.CREDIT ? line.amountKobo : -line.amountKobo),
        0n,
      );
      expect(position).toBe(0n);

      const replay = await service.redeem(userId, subscriptionId, redemptionKey);
      expect(replay.id).toBe(subscriptionId);
      expect(replay.status).toBe('COMPLETED');

      await expect(service.redeem(userId, subscriptionId, `${redemptionKey}-second`)).rejects.toThrow(
        'INSUFFICIENT_INVESTMENT_POSITION',
      );

      expect(await prisma.transaction.count({ where: { idempotencyKey: transactionKey, investmentSubscriptionId: subscriptionId } })).toBe(1);
      expect(await prisma.journalEntry.count({ where: { idempotencyKey: transactionKey } })).toBe(1);
    } finally {
      await prismaService.$disconnect();
    }
  });
});
