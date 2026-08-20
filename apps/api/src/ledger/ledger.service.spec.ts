import { LedgerService } from './ledger.service';

describe('LedgerService user balance authorization', () => {
  const prisma = {
    userLedgerAccount: { findFirst: jest.fn() },
    account: { findUnique: jest.fn().mockResolvedValue({ id: 'acct-1' }) },
    journalEntry: { findMany: jest.fn().mockResolvedValue([]) },
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
});
