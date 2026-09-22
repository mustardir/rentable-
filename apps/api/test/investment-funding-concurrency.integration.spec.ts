import { EntryStatus, AccountType, Direction, ProductStatus, ProductType, TransactionStatus, UserRole, PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaLedgerRepository } from '../src/ledger/prisma-ledger.repository';
import { InvestmentSubscriptionService } from '../src/financial-products/investment-subscription.service';

const prisma = new PrismaClient();
const describePrisma = process.env.DATABASE_URL ? describe : describe.skip;

describePrisma('Investment funding concurrency and idempotency (PostgreSQL)', () => {
  const prefix = `investment-funding-concurrency-${Date.now()}-${process.pid}`;
  const userId = `${prefix}-user`;
  const productId = `${prefix}-product`;
  const subscriptionId = `${prefix}-subscription`;
  const productCode = `${prefix}-code`;
  const subscriptionKey = `${prefix}-subscription-key`;
  const subscriptionReference = `${prefix}-subscription-ref`;
  const fundingKey = `INVEST-FUND-${subscriptionKey}`;
  const investorCashAccountId = 'acct_1100';
  const customerDepositsAccountId = 'acct_2100';
  const productObligationsAccountId = 'acct_2200';

  beforeAll(async () => {
    await prisma.account.upsert({
      where: { code: '1100' },
      update: {},
      create: { id: investorCashAccountId, code: '1100', name: 'Investor Cash Test Account', type: AccountType.ASSET, normalBalance: Direction.DEBIT },
    });
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
    await prisma.user.create({ data: { id: userId, email: `${userId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.INVESTOR } });
    await prisma.financialProduct.create({
      data: { id: productId, code: productCode, name: 'Concurrency Test Investment', type: ProductType.INVESTMENT, currency: 'USD', minimumAmountMinor: 5000n, status: ProductStatus.ACTIVE },
    });
    await prisma.investmentSubscription.create({
      data: { id: subscriptionId, userId, productId, amountMinor: 5000n, currency: 'USD', status: 'PENDING', idempotencyKey: subscriptionKey, reference: subscriptionReference },
    });
    await prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-initial-funding`,
        reference: `${prefix}-initial-funding-ref`,
        description: 'Initial USD funding for investment concurrency test',
        currency: 'USD',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: investorCashAccountId, currency: 'USD', direction: Direction.DEBIT, amountKobo: 5000n },
            { accountId: customerDepositsAccountId, currency: 'USD', direction: Direction.CREDIT, amountKobo: 5000n, metadata: { investorId: userId, funding: true } },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    // Transactions reference subscriptions with RESTRICT; remove lifecycle transactions first.
    await prisma.transaction.deleteMany({ where: { idempotencyKey: fundingKey } });
    await prisma.investmentSubscription.deleteMany({ where: { id: subscriptionId } });
    await prisma.financialProduct.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('converges concurrent identical funding requests to one completed investment', async () => {
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
        service.fund(userId, subscriptionId),
        service.fund(userId, subscriptionId),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');

      if (fulfilled.length !== 2 || rejected.length !== 0) {
        const outcomes = results.map((result) =>
          result.status === 'fulfilled'
            ? { status: result.status, subscriptionId: result.value.id, state: result.value.status }
            : { status: result.status, message: result.reason instanceof Error ? result.reason.message : String(result.reason) },
        );
        throw new Error(`Concurrent identical funding did not converge: ${JSON.stringify(outcomes)}`);
      }

      const transactions = await prisma.transaction.findMany({
        where: { idempotencyKey: fundingKey },
        select: { id: true, status: true, amountKobo: true, currency: true, journalEntryId: true },
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({ status: TransactionStatus.COMPLETED, amountKobo: 5000n, currency: 'USD', journalEntryId: expect.any(String) });

      const journalEntries = await prisma.journalEntry.findMany({ where: { idempotencyKey: fundingKey }, include: { lines: true } });
      expect(journalEntries).toHaveLength(1);
      expect(journalEntries[0]?.status).toBe(EntryStatus.POSTED);
      expect(journalEntries[0]?.currency).toBe('USD');
      expect(journalEntries[0]?.lines).toHaveLength(2);

      const subscription = await prisma.investmentSubscription.findUnique({ where: { id: subscriptionId } });
      expect(subscription).toMatchObject({ status: 'COMPLETED', journalEntryId: journalEntries[0]?.id, transactionId: transactions[0]?.id });

      const replay = await service.fund(userId, subscriptionId);
      expect(replay.id).toBe(subscriptionId);
      expect(replay.status).toBe('COMPLETED');

      const transactionCount = await prisma.transaction.count({ where: { idempotencyKey: fundingKey } });
      const journalCount = await prisma.journalEntry.count({ where: { idempotencyKey: fundingKey } });
      expect(transactionCount).toBe(1);
      expect(journalCount).toBe(1);
    } finally {
      await prismaService.$disconnect();
    }
  });
});
