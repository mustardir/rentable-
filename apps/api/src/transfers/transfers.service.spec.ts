import { TransfersService } from './transfers.service';

describe('TransfersService ledger integration', () => {
  function makePrisma() {
    const tx = {
      transaction: {
        create: jest.fn().mockResolvedValue({ id: 'txn-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      journalEntry: {
        create: jest.fn(),
      },
      transfer: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const prisma = {
      transfer: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (tx: typeof tx) => unknown) => callback(tx)),
    };

    return { prisma, tx };
  }

  it('persists investor-scoped debit and credit journal lines atomically', async () => {
    const { prisma, tx } = makePrisma();
    const journalEntry = {
      id: 'entry-1',
      idempotencyKey: 'transfer-1',
      lines: [
        {
          id: 'line-source',
          accountId: 'acct_2100',
          direction: 'DEBIT',
          amountKobo: 10000n,
          metadata: { investorId: 'user-a', transferRole: 'source', reference: 'TRF-1' },
        },
        {
          id: 'line-destination',
          accountId: 'acct_2100',
          direction: 'CREDIT',
          amountKobo: 10000n,
          metadata: { investorId: 'user-b', transferRole: 'destination', reference: 'TRF-1' },
        },
      ],
    };

    tx.journalEntry.create.mockResolvedValue(journalEntry);
    tx.transfer.create.mockResolvedValue({ id: 'transfer-1', journalEntry });

    const service = new TransfersService(prisma as any);
    const result = await service.createTransfer({
      sourceUserId: 'user-a',
      destinationUserId: 'user-b',
      amountKobo: '10000',
      idempotencyKey: 'transfer-1',
      reference: 'TRF-1',
      currency: 'NGN',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.create.mock.calls[0][0].data.lines.create).toEqual([
      expect.objectContaining({
        accountId: 'acct_2100',
        direction: 'DEBIT',
        amountKobo: 10000n,
        metadata: expect.objectContaining({ investorId: 'user-a' }),
      }),
      expect.objectContaining({
        accountId: 'acct_2100',
        direction: 'CREDIT',
        amountKobo: 10000n,
        metadata: expect.objectContaining({ investorId: 'user-b' }),
      }),
    ]);
    expect(result.journalEntry.lines).toHaveLength(2);
    expect(result.journalEntry.lines[0].amountKobo).toBe(10000n);
    expect(result.journalEntry.lines[1].amountKobo).toBe(10000n);
  });

  it('returns the existing transfer for an idempotency-key replay', async () => {
    const { prisma } = makePrisma();
    const existing = { id: 'transfer-existing', status: 'COMPLETED' };
    prisma.transfer.findUnique.mockResolvedValue(existing);

    const service = new TransfersService(prisma as any);
    const result = await service.createTransfer({
      sourceUserId: 'user-a',
      destinationUserId: 'user-b',
      amountKobo: '10000',
      idempotencyKey: 'transfer-1',
    });

    expect(result).toBe(existing);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
