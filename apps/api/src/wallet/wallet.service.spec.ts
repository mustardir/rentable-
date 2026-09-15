import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const transaction = jest.fn();
  const audit = { append: jest.fn().mockResolvedValue(undefined), appendInTransaction: jest.fn().mockResolvedValue(undefined) };
  const txUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const txUpdate = jest.fn().mockResolvedValue({ id: 'tx-1', status: 'COMPLETED' });
  const txQueryRaw = jest.fn().mockResolvedValue([]);
  const prisma = {
    user: { findUnique: jest.fn() },
    transaction: { findUnique: jest.fn(), create: jest.fn() },
    journalLine: { findMany: jest.fn() },
    journalEntry: { create: jest.fn() },
    $transaction: transaction,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    audit.append.mockResolvedValue(undefined);
    audit.appendInTransaction.mockResolvedValue(undefined);
    txUpdateMany.mockResolvedValue({ count: 1 });
    txUpdate.mockResolvedValue({ id: 'tx-1', status: 'COMPLETED' });
    txQueryRaw.mockResolvedValue([]);
    transaction.mockImplementation(async (callback: any) => callback({
      transaction: {
        findUnique: prisma.transaction.findUnique,
        findUniqueOrThrow: prisma.transaction.findUnique,
        updateMany: txUpdateMany,
        update: txUpdate,
      },
      journalLine: { findMany: prisma.journalLine.findMany },
      journalEntry: { create: prisma.journalEntry.create },
      $queryRaw: txQueryRaw,
    }));
  });

  const service = () => new WalletService(prisma, audit as any);

  it('creates a pending deposit without minting ledger funds', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true });
    prisma.transaction.findUnique.mockResolvedValue(null);
    prisma.transaction.create.mockResolvedValue({ id: 'tx-1', status: 'PENDING' });

    const result = await service().createDepositRequest('user-a', {
      amountKobo: '125000', idempotencyKey: 'dep-1', currency: 'usd',
    });

    expect(result).toMatchObject({ id: 'tx-1', status: 'PENDING' });
    expect(prisma.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-a', type: 'DEPOSIT', status: 'PENDING', amountKobo: 125000n, currency: 'USD',
      }),
    }));
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects wallet requests without an explicit currency', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true });
    await expect(service().createDepositRequest('user-a', { amountKobo: '1000', idempotencyKey: 'dep-missing-currency' })).rejects.toThrow('INVALID_CURRENCY');
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects invalid currency codes', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true });
    await expect(service().createWithdrawalRequest('user-a', { amountKobo: '1000', idempotencyKey: 'wdr-invalid-currency', currency: 'US' })).rejects.toThrow('INVALID_CURRENCY');
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('posts a confirmed deposit as DR investor cash / CR customer deposits and audits approval once', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({ id: 'tx-1', userId: 'user-a', type: 'DEPOSIT', status: 'PENDING', amountKobo: 125000n, currency: 'USD', reference: 'DEP-1', idempotencyKey: 'dep-1' });
    prisma.journalEntry.create.mockResolvedValue({ id: 'je-1' });
    txUpdate.mockResolvedValue({ id: 'tx-1', status: 'COMPLETED', amountKobo: 125000n, currency: 'USD', reference: 'DEP-1', type: 'DEPOSIT' });

    const result = await service().confirmRequest('tx-1', 'admin-1');

    expect(result.status).toBe('COMPLETED');
    expect(txQueryRaw).toHaveBeenCalledTimes(1);
    expect(txQueryRaw.mock.calls[0][0]).toEqual(expect.objectContaining({ strings: expect.any(Array) }));
    expect(prisma.journalEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: 'wallet:dep-1', currency: 'USD', createdByUserId: 'admin-1' }) }));
    expect(audit.appendInTransaction).toHaveBeenCalledTimes(1);
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('locks before checking a withdrawal balance and posts with the same transaction lock', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({ id: 'tx-2', userId: 'user-a', type: 'WITHDRAWAL', status: 'PENDING', amountKobo: 50000n, currency: 'USD', reference: 'WDR-USD-1', idempotencyKey: 'wdr-usd-1' });
    prisma.journalLine.findMany.mockResolvedValue([{ direction: 'CREDIT', amountKobo: 100000n }]);
    prisma.journalEntry.create.mockResolvedValue({ id: 'je-2' });
    txUpdate.mockResolvedValue({ id: 'tx-2', status: 'COMPLETED', amountKobo: 50000n, currency: 'USD', reference: 'WDR-USD-1', type: 'WITHDRAWAL' });

    const result = await service().confirmRequest('tx-2', 'admin-1');

    expect(result.status).toBe('COMPLETED');
    expect(txQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.journalLine.findMany.mock.invocationCallOrder[0]);
    expect(prisma.journalLine.findMany.mock.invocationCallOrder[0]).toBeLessThan(prisma.journalEntry.create.mock.invocationCallOrder[0]);
  });

  it('filters withdrawal balance by the transaction currency', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({ id: 'tx-3', userId: 'user-a', type: 'WITHDRAWAL', status: 'PENDING', amountKobo: 100001n, currency: 'USD', reference: 'WDR-USD-2', idempotencyKey: 'wdr-usd-2' });
    prisma.journalLine.findMany.mockResolvedValue([{ direction: 'CREDIT', amountKobo: 100000n }]);

    await expect(service().confirmRequest('tx-3', 'admin-1')).rejects.toThrow('Insufficient available balance');
    expect(prisma.journalLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ journalEntry: { status: 'POSTED', currency: 'USD' } }) }));
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not duplicate posting or approval audit when an already-completed request is confirmed again', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    const completed = { id: 'tx-1', userId: 'user-a', type: 'DEPOSIT', status: 'COMPLETED', amountKobo: 125000n, currency: 'USD', reference: 'DEP-1', idempotencyKey: 'dep-1' };
    prisma.transaction.findUnique.mockResolvedValue(completed);
    const result = await service().confirmRequest('tx-1', 'admin-1');
    expect(result).toBe(completed);
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    expect(audit.appendInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a pending request without creating a journal entry and audits the rejection', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'COMPLIANCE' });
    const pending = { id: 'tx-2', userId: 'user-a', type: 'WITHDRAWAL', status: 'PENDING', amountKobo: 100000n, currency: 'USD', reference: 'WDR-1', idempotencyKey: 'wdr-1' };
    const cancelled = { ...pending, status: 'CANCELLED', metadata: { rejectionReason: 'KYC mismatch', rejectedByUserId: 'admin-1' } };
    prisma.transaction.findUnique.mockReturnValueOnce(Promise.resolve(pending)).mockReturnValueOnce(Promise.resolve(cancelled));
    const result = await service().rejectRequest('tx-2', 'admin-1', ' KYC mismatch ');
    expect(result.status).toBe('CANCELLED');
    expect(txUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tx-2', status: 'PENDING' } }));
    expect(audit.appendInTransaction).toHaveBeenCalledTimes(1);
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('does not duplicate rejection audit when an already-cancelled request is rejected again', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    const cancelled = { id: 'tx-2', userId: 'user-a', type: 'WITHDRAWAL', status: 'CANCELLED', amountKobo: 100000n, currency: 'USD', reference: 'WDR-1', idempotencyKey: 'wdr-1' };
    prisma.transaction.findUnique.mockResolvedValue(cancelled);
    const result = await service().rejectRequest('tx-2', 'admin-1', 'duplicate');
    expect(result).toBe(cancelled);
    expect(txUpdateMany).not.toHaveBeenCalled();
    expect(audit.appendInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a withdrawal confirmation when posted customer balance is insufficient', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true, role: 'ADMIN' });
    prisma.transaction.findUnique.mockResolvedValue({ id: 'tx-2', userId: 'user-a', type: 'WITHDRAWAL', status: 'PENDING', amountKobo: 100001n, currency: 'USD', reference: 'WDR-1', idempotencyKey: 'wdr-1' });
    prisma.journalLine.findMany.mockResolvedValue([{ direction: 'CREDIT', amountKobo: 100000n }]);
    await expect(service().confirmRequest('tx-2', 'admin-1')).rejects.toThrow('Insufficient available balance');
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    expect(audit.appendInTransaction).not.toHaveBeenCalled();
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
    await expect(service().createDepositRequest('user-a', { amountKobo: '12.5', idempotencyKey: 'dep-2', currency: 'USD' })).rejects.toThrow('positive integer string');
    await expect(service().createDepositRequest('user-a', { amountKobo: '0', idempotencyKey: 'dep-3', currency: 'USD' })).rejects.toThrow('greater than 0');
  });
});
