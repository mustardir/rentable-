import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const transaction = jest.fn();
  const audit = { append: jest.fn().mockResolvedValue(undefined) };
  const txUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const txUpdate = jest.fn().mockResolvedValue({ id: 'tx-1', status: 'COMPLETED' });
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
    audit.append.mockResolvedValue(undefined);
    txUpdateMany.mockResolvedValue({ count: 1 });
    txUpdate.mockResolvedValue({ id: 'tx-1', status: 'COMPLETED' });
    transaction.mockImplementation(async (callback: any) => callback({
      transaction: {
        findUnique: prisma.transaction.findUnique,
        findUniqueOrThrow: prisma.transaction.findUnique,
        updateMany: txUpdateMany,
        update: txUpdate,
      },
      journalLine: { findMany: prisma.journalLine.findMany },
      journalEntry: { create: prisma.journalEntry.create },
    }));
  });

  const service = () => new WalletService(prisma, audit as any);

  it('creates a pending deposit without minting ledger funds', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true });
    prisma.transaction.findUnique.mockResolvedValue(null);
    prisma.transaction.create.mockResolvedValue({ id: 'tx-1', status: 'PENDING' });

    const result = await service().createDepositRequest('user-a', {
      amountKobo: '125000', idempotencyKey: 'dep-1',
    });

    expect(result).toMatchObject({ id: 'tx-1', status: 'PENDING' });
    expect(prisma.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-a', type: 'DEPOSIT', status: 'PENDING', amountKobo: 125000n,
      }),
    }));
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('posts a confirmed deposit as DR investor cash / CR customer deposits and audits approval once', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'tx-1', userId: 'user-a', type: 'DEPOSIT', status: 'PENDING', amountKobo: 125000n,
      currency: 'NGN', reference: 'DEP-1', idempotencyKey: 'dep-1',
    });
    prisma.journalEntry.create.mockResolvedValue({ id: 'je-1' });
    txUpdate.mockResolvedValue({ id: 'tx-1', status: 'COMPLETED', amountKobo: 125000n, currency: 'NGN', reference: 'DEP-1', type: 'DEPOSIT' });

    const result = await service().confirmRequest('tx-1', 'admin-1');

    expect(result.status).toBe('COMPLETED');
    expect(prisma.journalEntry.create).toHaveBeenCalledTimes(1);
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
    expect(audit.append).toHaveBeenCalledTimes(1);
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'WALLET_REQUEST_APPROVED', entityId: 'tx-1' }));
  });

  it('does not duplicate posting or approval audit when an already-completed request is confirmed again', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    const completed = { id: 'tx-1', userId: 'user-a', type: 'DEPOSIT', status: 'COMPLETED', amountKobo: 125000n, currency: 'NGN', reference: 'DEP-1', idempotencyKey: 'dep-1' };
    prisma.transaction.findUnique.mockResolvedValue(completed);

    const result = await service().confirmRequest('tx-1', 'admin-1');

    expect(result).toBe(completed);
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('rejects a pending request without creating a journal entry and audits the rejection', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'COMPLIANCE' });
    const pending = { id: 'tx-2', userId: 'user-a', type: 'WITHDRAWAL', status: 'PENDING', amountKobo: 100000n, currency: 'NGN', reference: 'WDR-1', idempotencyKey: 'wdr-1' };
    const cancelled = { ...pending, status: 'CANCELLED', metadata: { rejectionReason: 'KYC mismatch', rejectedByUserId: 'admin-1' } };
    prisma.transaction.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce(cancelled);

    const result = await service().rejectRequest('tx-2', 'admin-1', ' KYC mismatch ');

    expect(result.status).toBe('CANCELLED');
    expect(txUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tx-2', status: 'PENDING' },
      data: expect.objectContaining({ status: 'CANCELLED', metadata: expect.objectContaining({ rejectionReason: 'KYC mismatch', rejectedByUserId: 'admin-1' }) }),
    }));
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledTimes(1);
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'WALLET_REQUEST_REJECTED', entityId: 'tx-2', payload: expect.objectContaining({ reason: 'KYC mismatch' }) }));
  });

  it('does not duplicate rejection audit when an already-cancelled request is rejected again', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    const cancelled = { id: 'tx-2', userId: 'user-a', type: 'WITHDRAWAL', status: 'CANCELLED', amountKobo: 100000n, currency: 'NGN', reference: 'WDR-1', idempotencyKey: 'wdr-1' };
    prisma.transaction.findUnique.mockResolvedValue(cancelled);

    const result = await service().rejectRequest('tx-2', 'admin-1', 'duplicate');

    expect(result).toBe(cancelled);
    expect(txUpdateMany).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('rejects a withdrawal confirmation when posted customer balance is insufficient', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'tx-2', userId: 'user-a', type: 'WITHDRAWAL', status: 'PENDING', amountKobo: 100001n,
      currency: 'NGN', reference: 'WDR-1', idempotencyKey: 'wdr-1',
    });
    prisma.journalLine.findMany.mockResolvedValue([{ direction: 'CREDIT', amountKobo: 100000n }]);

    await expect(service().confirmRequest('tx-2', 'admin-1')).rejects.toThrow('Insufficient available balance');
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('rejects wallet approval by a normal user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true, role: 'USER' });

    await expect(service().confirmRequest('tx-1', 'user-a')).rejects.toThrow('Only an active admin or compliance user');
  });

  it('rejects wallet rejection by a normal user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true, role: 'USER' });

    await expect(service().rejectRequest('tx-1', 'user-a')).rejects.toThrow('Only an active admin or compliance user');
  });

  it('rejects non-pending requests from being confirmed or rejected', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({ id: 'tx-1', status: 'PROCESSING' });

    await expect(service().confirmRequest('tx-1', 'admin-1')).rejects.toThrow('cannot be confirmed');
    await expect(service().rejectRequest('tx-1', 'admin-1')).rejects.toThrow('cannot be rejected');
  });

  it('requires integer positive kobo amounts', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true });

    await expect(service().createDepositRequest('user-a', { amountKobo: '12.5', idempotencyKey: 'dep-2' })).rejects.toThrow('positive integer string');
    await expect(service().createDepositRequest('user-a', { amountKobo: '0', idempotencyKey: 'dep-3' })).rejects.toThrow('greater than 0');
  });
});
