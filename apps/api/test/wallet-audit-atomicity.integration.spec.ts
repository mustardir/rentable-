import { PrismaClient, AccountType, Direction, TransactionStatus, TransactionType, UserRole } from '@prisma/client';
import { WalletService } from '../src/wallet/wallet.service';

const prisma = new PrismaClient();
const DATABASE_URL = process.env.DATABASE_URL;
const describePrisma = DATABASE_URL ? describe : describe.skip;

const INVESTOR_CASH_ACCOUNT_ID = 'acct_1100';
const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';

describePrisma('Fortress Wallet Audit Atomicity (PostgreSQL)', () => {
  const prefix = `wallet-audit-atomicity-${Date.now()}-${process.pid}`;
  const operatorId = `${prefix}-operator`;
  const investorId = `${prefix}-investor`;
  const approvalTransactionId = `${prefix}-approval`;
  const rejectionTransactionId = `${prefix}-rejection`;

  beforeAll(async () => {
    await prisma.account.upsert({
      where: { code: '1100' },
      update: {},
      create: {
        id: INVESTOR_CASH_ACCOUNT_ID,
        code: '1100',
        name: 'Investor Cash Audit Atomicity Test Account',
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
        name: 'Customer Deposits Audit Atomicity Test Account',
        type: AccountType.LIABILITY,
        normalBalance: Direction.CREDIT,
      },
    });

    await prisma.user.createMany({
      data: [
        { id: operatorId, email: `${operatorId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.SUPER_ADMIN },
        { id: investorId, email: `${investorId}@test.invalid`, passwordHash: 'test-hash', role: UserRole.INVESTOR },
      ],
    });

    await prisma.transaction.createMany({
      data: [
        {
          id: approvalTransactionId,
          userId: investorId,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.PENDING,
          amountKobo: 10000n,
          currency: 'USD',
          reference: `${prefix}-approval-ref`,
          idempotencyKey: `${prefix}-approval-key`,
          metadata: { workflow: 'customer_deposit' },
        },
        {
          id: rejectionTransactionId,
          userId: investorId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.PENDING,
          amountKobo: 10000n,
          currency: 'USD',
          reference: `${prefix}-rejection-ref`,
          idempotencyKey: `${prefix}-rejection-key`,
          metadata: { workflow: 'customer_withdrawal' },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { id: { in: [approvalTransactionId, rejectionTransactionId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [operatorId, investorId] } } });
    await prisma.$disconnect();
  });

  it('rolls back the approval when the audit append fails', async () => {
    const audit = {
      append: jest.fn(),
      appendInTransaction: jest.fn().mockRejectedValue(new Error('AUDIT_APPEND_FAILED')),
    };
    const service = new WalletService(prisma as any, audit as any);

    await expect(service.confirmRequest(approvalTransactionId, operatorId)).rejects.toThrow('AUDIT_APPEND_FAILED');

    const transaction = await prisma.transaction.findUnique({ where: { id: approvalTransactionId } });
    expect(transaction?.status).toBe(TransactionStatus.PENDING);
    expect(transaction?.journalEntryId).toBeNull();

    const journalCount = await prisma.journalEntry.count({
      where: { idempotencyKey: `${prefix}-approval-key` },
    });
    expect(journalCount).toBe(0);
    expect(audit.append).not.toHaveBeenCalled();
    expect(audit.appendInTransaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back the rejection when the audit append fails', async () => {
    const audit = {
      append: jest.fn(),
      appendInTransaction: jest.fn().mockRejectedValue(new Error('AUDIT_APPEND_FAILED')),
    };
    const service = new WalletService(prisma as any, audit as any);

    await expect(service.rejectRequest(rejectionTransactionId, operatorId, 'KYC mismatch')).rejects.toThrow('AUDIT_APPEND_FAILED');

    const transaction = await prisma.transaction.findUnique({ where: { id: rejectionTransactionId } });
    expect(transaction?.status).toBe(TransactionStatus.PENDING);
    expect(transaction?.metadata).toEqual({ workflow: 'customer_withdrawal' });
    expect(audit.append).not.toHaveBeenCalled();
    expect(audit.appendInTransaction).toHaveBeenCalledTimes(1);
  });
});
