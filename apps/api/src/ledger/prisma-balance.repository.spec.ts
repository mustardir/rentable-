import { PrismaBalanceRepository } from './prisma-balance.repository';

describe('PrismaBalanceRepository', () => {
  const prisma = {
    journalEntry: { findMany: jest.fn() },
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('derives an investor balance from POSTED journal lines only', async () => {
    prisma.journalEntry.findMany.mockResolvedValue([
      {
        id: 'posted',
        idempotencyKey: 'posted-key',
        status: 'POSTED',
        postedAt: new Date(),
        createdAt: new Date(),
        reversalOfId: null,
        reversedById: null,
        lines: [
          { id: 'line-a', journalEntryId: 'posted', accountId: 'acct-2100', direction: 'CREDIT', amountKobo: 10000n, metadata: { investorId: 'user-a' }, createdAt: new Date() },
          { id: 'line-b', journalEntryId: 'posted', accountId: 'acct-2100', direction: 'CREDIT', amountKobo: 25000n, metadata: { investorId: 'user-b' }, createdAt: new Date() },
        ],
      },
    ]);

    const repository = new PrismaBalanceRepository(prisma);
    const balance = await repository.getInvestorBalance('acct-2100', 'user-a');

    expect(balance).toBe(10000n);
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith({
      where: { status: 'POSTED' },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('preserves large kobo values as bigint without precision loss', async () => {
    prisma.journalEntry.findMany.mockResolvedValue([
      {
        id: 'large',
        idempotencyKey: 'large-key',
        status: 'POSTED',
        postedAt: new Date(),
        createdAt: new Date(),
        reversalOfId: null,
        reversedById: null,
        lines: [
          { id: 'large-line', journalEntryId: 'large', accountId: 'acct-1100', direction: 'DEBIT', amountKobo: 9007199254740993n, metadata: {}, createdAt: new Date() },
        ],
      },
    ]);

    const repository = new PrismaBalanceRepository(prisma);
    const balance = await repository.getAccountBalance('acct-1100');

    expect(balance).toBe(9007199254740993n);
  });
});
