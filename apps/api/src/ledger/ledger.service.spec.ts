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
      accountId: 'acct-a',
      currency: 'NGN',
      isActive: true,
    });
    prisma.account.findUnique.mockResolvedValue({ id: 'acct-a' });
    prisma.journalEntry.findMany.mockResolvedValue([]);
    const service = new LedgerService(prisma);
    const balance = await service.getMyBalance('user-a');
    expect(prisma.userLedgerAccount.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-a', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(balance.accountId).toBe('acct-a');
    expect(balance.currency).toBe('NGN');
    expect(balance.balanceKobo).toBe('0');
  });

  it('does not include another user’s journal lines on a shared customer-deposit account', async () => {
    prisma.userLedgerAccount.findFirst.mockResolvedValue({
      accountId: 'acct-2100',
      currency: 'NGN',
      isActive: true,
    });
    prisma.journalEntry.findMany.mockResolvedValue([
      {
        id: 'entry-a',
        idempotencyKey: 'idem-a',
        status: 'POSTED',
        postedAt: new Date(),
        createdAt: new Date(),
        reversalOfId: null,
        reversedById: null,
        lines: [
          { id: 'line-a', journalEntryId: 'entry-a', accountId: 'acct-2100', direction: 'CREDIT', amountKobo: 10000n, metadata: { investorId: 'user-a' }, createdAt: new Date() },
          { id: 'line-b', journalEntryId: 'entry-a', accountId: 'acct-2100', direction: 'CREDIT', amountKobo: 25000n, metadata: { investorId: 'user-b' }, createdAt: new Date() },
        ],
      },
    ]);
    const service = new LedgerService(prisma);
    const balance = await service.getMyBalance('user-a');
    expect(balance.balanceKobo).toBe('10000');
  });
});
