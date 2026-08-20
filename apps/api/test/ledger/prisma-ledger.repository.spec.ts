import { PrismaClient } from '@prisma/client';
import type { JournalEntry } from '@fortress/ledger-core';
import { PrismaLedgerRepository } from '../../src/ledger/prisma-ledger.repository';

const databaseUrl = process.env.DATABASE_URL;
const describePrisma = databaseUrl ? describe : describe.skip;

describePrisma('PrismaLedgerRepository concurrent idempotency', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaLedgerRepository(prisma as never);
  const accountIds = ['test-prisma-idem-debit', 'test-prisma-idem-credit'];
  const prefix = `prisma-idem-${Date.now()}-${process.pid}`;

  function entry(id: string, key: string): JournalEntry {
    const now = new Date();
    return {
      id,
      idempotencyKey: key,
      status: 'POSTED',
      postedAt: now,
      createdAt: now,
      lines: [
        { id: `${id}-debit`, journalEntryId: id, accountId: accountIds[0], direction: 'DEBIT', amountKobo: 10_000n, metadata: {}, createdAt: now },
        { id: `${id}-credit`, journalEntryId: id, accountId: accountIds[1], direction: 'CREDIT', amountKobo: 10_000n, metadata: {}, createdAt: now },
      ],
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.account.createMany({
      data: [
        { id: accountIds[0], code: `${prefix}-debit`, name: 'Prisma idempotency debit', type: 'ASSET', normalBalance: 'DEBIT' },
        { id: accountIds[1], code: `${prefix}-credit`, name: 'Prisma idempotency credit', type: 'LIABILITY', normalBalance: 'CREDIT' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.journalLine.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.$disconnect();
  });

  it('returns one authoritative entry for concurrent duplicate idempotency keys', async () => {
    const key = `${prefix}-key`;
    const first = entry(`${prefix}-entry-a`, key);
    const second = entry(`${prefix}-entry-b`, key);

    const [a, b] = await Promise.all([
      repository.saveEntry(first),
      repository.saveEntry(second),
    ]);

    expect(a.id).toBe(b.id);
    expect(a.idempotencyKey).toBe(key);

    const persisted = await prisma.journalEntry.findUnique({
      where: { idempotencyKey: key },
      include: { lines: true },
    });

    expect(persisted).not.toBeNull();
    expect(persisted?.lines).toHaveLength(2);
    expect(persisted?.lines.reduce((sum, line) => sum + (line.direction === 'DEBIT' ? line.amountKobo : -line.amountKobo), 0n)).toBe(0n);
  });
});
