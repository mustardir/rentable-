import { TransfersService } from './transfers.service';

describe('TransfersService ledger integration', () => {
  function makePrisma(balanceLines = [{ direction: 'CREDIT', amountKobo: 20000n }]) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      transaction: {
        create: jest.fn().mockResolvedValue({ id: 'txn-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      journalEntry: {
        create: jest.fn(),
      },
      journalLine: {
        findMany: jest.fn().mockResolvedValue(balanceLines),
      },
      transfer: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    type TxClient = typeof tx;
    const prisma = {
      transfer: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: TxClient) => unknown) => callback(tx)),
    };

    return { prisma, tx };
  }

  const dto = {
    sourceUserId: 'user-a',
    destinationUserId: 'user-b',
    amountKobo: '10000',
    idempotencyKey: 'transfer-1',
    reference: 'TRF-1',
    currency: 'NGN',
  };

  it('locks the source balance before reading balance and posting', async () => {
    const { prisma, tx } = makePrisma();
    const journalEntry = {
      id: 'entry-1',
      idempotencyKey: 'transfer-1',
      lines: [
        { id: 'line-source', accountId: 'acct_2100', direction: 'DEBIT', amountKobo: 10000n, metadata: { investorId: 'user-a' } },
        { id: 'line-destination', accountId: 'acct_2100', direction: 'CREDIT', amountKobo: 10000n, metadata: { investorId: 'user-b' } },
      ],
    };
    tx.journalEntry.create.mockResolvedValue(journalEntry);
    tx.transfer.create.mockResolvedValue({ id: 'transfer-1', journalEntry });

    const service = new TransfersService(prisma as any);
    await service.createTransfer(dto);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.journalLine.findMany).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.journalLine.findMany.mock.invocationCallOrder[0]);
    expect(tx.journalLine.findMany.mock.invocationCallOrder[0]).toBeLessThan(tx.transaction.create.mock.invocationCallOrder[0]);
  });

  it('filters available balance by currency', async () => {
    const { prisma, tx } = makePrisma();
    const journalEntry = { id: 'entry-currency', idempotencyKey: 'transfer-currency', lines: [] };
    tx.journalEntry.create.mockResolvedValue(journalEntry);
    tx.transfer.create.mockResolvedValue({ id: 'transfer-currency', journalEntry });

    const service = new TransfersService(prisma as any);
    await service.createTransfer({ ...dto, idempotencyKey: 'transfer-currency', currency: 'USD' });

    expect(tx.journalLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        journalEntry: { status: 'POSTED', currency: 'USD' },
      }),
    }));
  });

  it('persists investor-scoped debit and credit journal lines atomically', async () => {
    const { prisma, tx } = makePrisma();
    const journalEntry = {
      id: 'entry-1',
      idempotencyKey: 'transfer-1',
      lines: [
        { id: 'line-source', accountId: 'acct_2100', direction: 'DEBIT', amountKobo: 10000n, metadata: { investorId: 'user-a', transferRole: 'source', reference: 'TRF-1' } },
        { id: 'line-destination', accountId: 'acct_2100', direction: 'CREDIT', amountKobo: 10000n, metadata: { investorId: 'user-b', transferRole: 'destination', reference: 'TRF-1' } },
      ],
    };
    tx.journalEntry.create.mockResolvedValue(journalEntry);
    tx.transfer.create.mockResolvedValue({ id: 'transfer-1', journalEntry });

    const service = new TransfersService(prisma as any);
    const result = await service.createTransfer(dto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.create.mock.calls[0][0].data.lines.create).toEqual([
      expect.objectContaining({ accountId: 'acct_2100', direction: 'DEBIT', amountKobo: 10000n, metadata: expect.objectContaining({ investorId: 'user-a' }) }),
      expect.objectContaining({ accountId: 'acct_2100', direction: 'CREDIT', amountKobo: 10000n, metadata: expect.objectContaining({ investorId: 'user-b' }) }),
    ]);
    expect(result.journalEntry).toBeDefined();
    if (!result.journalEntry) throw new Error('Expected journalEntry to be returned');
    expect(result.journalEntry.lines).toHaveLength(2);
  });

  it('rejects a transfer when the source investor lacks sufficient available balance', async () => {
    const { prisma, tx } = makePrisma([{ direction: 'CREDIT', amountKobo: 5000n }]);
    const service = new TransfersService(prisma as any);

    await expect(service.createTransfer({ ...dto, idempotencyKey: 'transfer-insufficient', reference: 'TRF-INSUFFICIENT' })).rejects.toThrow('Insufficient available balance');
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    expect(tx.transfer.create).not.toHaveBeenCalled();
  });

  it('allows a transfer when the source investor has enough available balance', async () => {
    const { prisma, tx } = makePrisma([{ direction: 'CREDIT', amountKobo: 10000n }]);
    const journalEntry = { id: 'entry-sufficient', idempotencyKey: 'transfer-sufficient', lines: [] };
    tx.journalEntry.create.mockResolvedValue(journalEntry);
    tx.transfer.create.mockResolvedValue({ id: 'transfer-sufficient', journalEntry });

    const service = new TransfersService(prisma as any);
    await service.createTransfer({ ...dto, idempotencyKey: 'transfer-sufficient', reference: 'TRF-SUFFICIENT' });

    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.transfer.create).toHaveBeenCalledTimes(1);
  });

  it('returns the existing transfer for an idempotency-key replay', async () => {
    const { prisma } = makePrisma();
    const existing = { id: 'transfer-existing', status: 'COMPLETED' };
    prisma.transfer.findUnique.mockResolvedValue(existing);

    const service = new TransfersService(prisma as any);
    const result = await service.createTransfer(dto);

    expect(result).toBe(existing);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
