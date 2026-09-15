import { PrismaClient, AccountType, Direction, EntryStatus, TransactionStatus, TransactionType, UserRole } from '@prisma/client';
import { WalletService } from '../src/wallet/wallet.service';

const prisma = new PrismaClient();
const DATABASE_URL = process.env.DATABASE_URL;
const describePrisma = DATABASE_URL ? describe : describe.skip;

const INVESTOR_CASH_ACCOUNT_ID = 'acct_1100';
const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';

describePrisma('Fortress Wallet Approval/Rejection Concurrency (PostgreSQL)', () => {
  const prefix = `wallet-operator-race-${Date.now()}-${process.pid}`;
  const investorId = `${prefix}-investor`;
  const superAdminId = `${prefix}-super-admin`;
  const complianceId = `${prefix}-compliance`;
  const approvalTransactionId = `${prefix}-approval`;
  const rejectionTransactionId = `${prefix}-rejection`;

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
        { id: superAdminId, email: `${superAdminId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.SUPER_ADMIN },
        { id: complianceId, email: `${complianceId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.COMPLIANCE_OFFICER },
      ],
    });

    await prisma.transaction.createMany({
      data: [
        {
          id: approvalTransactionId,
          userId: investorId,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.PENDING,
          amountKobo: 5000n,
          currency: 'USD',
          reference: `${prefix}-approval-ref`,
          idempotencyKey: `${prefix}-approval-key`,
          metadata: { workflow: 'customer_deposit' },
        },
        {
          id: rejectionTransactionId,
          userId: investorId,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.PENDING,
          amountKobo: 5000n,
          currency: 'USD',
          reference: `${prefix}-rejection-ref`,
          idempotencyKey: `${prefix}-rejection-key`,
          metadata: { workflow: 'customer_deposit' },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows exactly one concurrent operator approval to post the wallet request', async () => {
    const service = new WalletService(prisma as any, { append: jest.fn().mockResolvedValue(undefined) } as any);

    const results = await Promise.allSettled([
      service.confirmRequest(approvalTransactionId, superAdminId),
      service.confirmRequest(approvalTransactionId, complianceId),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    if (fulfilled.length !== 1 || rejected.length !== 1) {
      const reasons = results.map((result) =>
        result.status === 'rejected'
          ? { status: result.status, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }
          : { status: result.status },
      );
      throw new Error(`Unexpected concurrent approval outcomes: ${JSON.stringify(reasons)}`);
    }

    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('already being processed');

    const transaction = await prisma.transaction.findUniqueOrThrow({ where: { id: approvalTransactionId } });
    expect(transaction.status).toBe(TransactionStatus.COMPLETED);
    expect(transaction.journalEntryId).toBeTruthy();

    const postedEntries = await prisma.journalEntry.findMany({
      where: { idempotencyKey: `${`wallet:${prefix}-approval-key`}`, status: EntryStatus.POSTED },
      include: { lines: true },
    });
    expect(postedEntries).toHaveLength(1);
    expect(postedEntries[0].lines).toHaveLength(2);
    expect(postedEntries[0].createdByUserId).toBeDefined();
  });

  it('allows exactly one concurrent operator rejection to cancel the wallet request', async () => {
    const service = new WalletService(prisma as any, { append: jest.fn().mockResolvedValue(undefined) } as any);

    const results = await Promise.allSettled([
      service.rejectRequest(rejectionTransactionId, superAdminId, 'Rejected by super admin'),
      service.rejectRequest(rejectionTransactionId, complianceId, 'Rejected by compliance'),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    if (fulfilled.length !== 1 || rejected.length !== 1) {
      const reasons = results.map((result) =>
        result.status === 'rejected'
          ? { status: result.status, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }
          : { status: result.status },
      );
      throw new Error(`Unexpected concurrent rejection outcomes: ${JSON.stringify(reasons)}`);
    }

    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('already being processed');

    const transaction = await prisma.transaction.findUniqueOrThrow({ where: { id: rejectionTransactionId } });
    expect(transaction.status).toBe(TransactionStatus.CANCELLED);
    expect(transaction.journalEntryId).toBeNull();

    const postedEntries = await prisma.journalEntry.count({
      where: { reference: `${prefix}-rejection-ref`, status: EntryStatus.POSTED },
    });
    expect(postedEntries).toBe(0);
  });
});
