import { LedgerService } from './ledger.service';

describe('LedgerService user balance authorization', () => {
  const prisma = {
    userLedgerAccount: { findFirst: jest.fn() },
    account: { findUnique: jest.fn().mockResolvedValue({ id: 'acct-2100' }) },
    journalEntry: { findMany: jest.fn() },
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('rejects a user with no active ledger account mapping', async () => {
    prisma.userLedgerAccount.findFirst.mockResolvedValue(null);
    const service = new LedgerService(prisma);
    await expect(service.getMyBalance('user-a')).rejects.toThrow('LEDGER_ACCOUNT_NOT_FOUND');
  });

  it('resolves the balance only through the authenticated user mapping', async () => {
    prisma.userLedgerAccount.findFirst.mockResolvedValue({
      accountId: 'acct-a', currency: 'NGN', isActive: true,
    });
    prisma.account.findUnique.mockResolvedValue({ id: 'acct-a' });
    prisma.journalEntry.findMany.mockResolvedValue([]);
    const service = new LedgerService(prisma);
    const balance = await service.getMyBalance('user-a');
    expect(balance.accountId).toBe('acct-a');
    expect(balance.currency).toBe('NGN');
    expect(balance.balanceKobo).toBe('0');
  });

  it('does not include another user’s journal lines on a shared customer-deposit account', async () => {
    prisma.userLedgerAccount.findFirst.mockResolvedValue({
      accountId: 'acct-2100', currency: 'NGN', isActive: true,
    });
    prisma.journalEntry.findMany.mockResolvedValue([{
      id: 'entry-a', idempotencyKey: 'idem-a', status: 'POSTED',
      postedAt: new Date(), createdAt: new Date(), reversalOfId: null, reversedById: null,
      lines: [
        { id: 'line-a', journalEntryId: 'entry-a', accountId: 'acct-2100', direction: 'CREDIT', amountKobo: 10000n, metadata: { investorId: 'user-a' }, createdAt: new Date() },
        { id: 'line-b', journalEntryId: 'entry-a', accountId: 'acct-2100', direction: 'CREDIT', amountKobo: 25000n, metadata: { investorId: 'user-b' }, createdAt: new Date() },
      ],
    }]);
    const service = new LedgerService(prisma);
    const balance = await service.getMyBalance('user-a');
    expect(balance.balanceKobo).toBe('10000');
  });

  it('returns only posted entries for the authenticated investor', async () => {
    prisma.userLedgerAccount.findFirst.mockResolvedValue({ accountId: 'acct-2100', currency: 'NGN', isActive: true });
    const postedAt = new Date('2026-09-03T10:00:00.000Z');
    prisma.journalEntry.findMany.mockResolvedValue([
      {
        id: 'entry-a', reference: 'DEP-1', description: 'Deposit DEP-1', currency: 'NGN', status: 'POSTED', postedAt,
        metadata: { transactionId: 'tx-a' },
        lines: [{ accountId: 'acct-2100', direction: 'CREDIT', amountKobo: 125000n, metadata: { investorId: 'user-a' } }],
      },
      {
        id: 'entry-b', reference: 'TRF-2', description: 'Transfer TRF-2', currency: 'NGN', status: 'POSTED', postedAt: new Date('2026-09-02T10:00:00.000Z'),
        metadata: { sourceUserId: 'user-b', destinationUserId: 'user-a' },
        lines: [
          { accountId: 'acct-2100', direction: 'CREDIT', amountKobo: 50000n, metadata: { investorId: 'user-a' } },
          { accountId: 'acct-2100', direction: 'DEBIT', amountKobo: 50000n, metadata: { investorId: 'user-b' } },
        ],
      },
    ]);
    const service = new LedgerService(prisma);
    const transactions = await service.getMyTransactions('user-a', 20);

    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({ id: 'entry-a', reference: 'DEP-1', direction: 'CREDIT', amountKobo: '125000' });
    expect(transactions[1]).toMatchObject({ id: 'entry-b', reference: 'TRF-2', direction: 'CREDIT', amountKobo: '50000' });
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'POSTED' }),
      take: 20,
    }));
  });

  it('limits transaction history to at most 100 entries', async () => {
    prisma.userLedgerAccount.findFirst.mockResolvedValue({ accountId: 'acct-2100', currency: 'NGN', isActive: true });
    prisma.journalEntry.findMany.mockResolvedValue([]);
    const service = new LedgerService(prisma);
    await service.getMyTransactions('user-a', 500);
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});
