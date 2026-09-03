import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const transaction = jest.fn();
  const prisma = {
    user: { findUnique: jest.fn() },
    transaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    journalLine: { findMany: jest.fn() },
    journalEntry: { create: jest.fn() },
    $transaction: transaction,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (callback: any) => callback({
      transaction: {
        findUnique: prisma.transaction.findUnique,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'tx-1', status: 'COMPLETED' }),
      },
      journalLine: { findMany: prisma.journalLine.findMany },
      journalEntry: { create: prisma.journalEntry.create },
    }));
  });

  it('creates a pending deposit without minting ledger funds', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true });
    prisma.transaction.findUnique.mockResolvedValue(null);
    prisma.transaction.create.mockResolvedValue({ id: 'tx-1', status: 'PENDING' });
    const service = new WalletService(prisma);

    const result = await service.createDepositRequest('user-a', {
      amountKobo: '125000', idempotencyKey: 'dep-1',
    });

    expect(result).toMatchObject({ id: 'tx-1', status: 'PENDING' });
    expect(prisma.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-a', type: 'DEPOSIT', status: 'PENDING', amountKobo: 125000n,
      }),
    }));
  });

  it('posts a confirmed deposit as DR investor cash / CR customer deposits', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'tx-1', userId: 'user-a', type: 'DEPOSIT', status: 'PENDING', amountKobo: 125000n,
      currency: 'NGN', reference: 'DEP-1', idempotencyKey: 'dep-1',
    });
    prisma.journalEntry.create.mockResolvedValue({ id: 'je-1' });
    const service = new WalletService(prisma);

    await service.confirmRequest('tx-1', 'admin-1');

    expect(prisma.journalEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        idempotencyKey: 'wallet:dep-1',
        createdByUserId: 'admin-1',
        lines: expect.objectContaining({
          create: expect.arrayContaining([
            expect.objectContaining({ accountId: 'acct_1100', direction: 'DEBIT', amountKobo: 125000n }),
            expect.objectContaining({ accountId: 'acct_2100', direction: 'CREDIT', amountKobo: 125000n }),
          ]),
        }),
      }),
    }));
  });

  it('rejects a withdrawal confirmation when posted customer balance is insufficient', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'tx-2', userId: 'user-a', type: 'WITHDRAWAL', status: 'PENDING', amountKobo: 100001n,
      currency: 'NGN', reference: 'WDR-1', idempotencyKey: 'wdr-1',
    });
    prisma.journalLine.findMany.mockResolvedValue([
      { direction: 'CREDIT', amountKobo: 100000n },
    ]);
    const service = new WalletService(prisma);

    await expect(service.confirmRequest('tx-2', 'admin-1')).rejects.toThrow('Insufficient available balance');
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects wallet confirmation by a normal user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true, role: 'USER' });
    const service = new WalletService(prisma);
    await expect(service.confirmRequest('tx-1', 'user-a')).rejects.toThrow('Only an active admin or compliance user');
  });

  it('requires integer positive kobo amounts', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true });
    const service = new WalletService(prisma);
    await expect(service.createDepositRequest('user-a', { amountKobo: '12.5', idempotencyKey: 'dep-2' })).rejects.toThrow('positive integer string');
    await expect(service.createDepositRequest('user-a', { amountKobo: '0', idempotencyKey: 'dep-3' })).rejects.toThrow('greater than 0');
  });
});
