/**
 * Integration tests for ledger immutability fortress_guard triggers.
 *
 * The database is intentionally append-only: posted entries and journal lines
 * cannot be deleted or modified. Tests therefore create the minimum chart of
 * accounts they need and do not attempt destructive cleanup of financial records.
 */

import { PrismaClient, EntryStatus, Direction, AccountType } from '@prisma/client';

const prisma = new PrismaClient();
const DATABASE_URL = process.env.DATABASE_URL;
const describePrisma = DATABASE_URL ? describe : describe.skip;

const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';
const INVESTOR_CASH_ACCOUNT_ID = 'acct_1100';

// Test-only currency used by the immutability suite.
const TEST_CURRENCY = 'NGN';

describePrisma('Fortress Ledger Immutability (PostgreSQL Triggers)', () => {
  const prefix = `ledger-immutable-${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    await prisma.account.upsert({
      where: { code: '1100' },
      update: {},
      create: {
        id: INVESTOR_CASH_ACCOUNT_ID,
        code: '1100',
        name: 'Investor Cash Test Account',
        type: AccountType.ASSET,
        normalBalance: Direction.DEBIT,
        metadata: { source: 'ledger-immutability-test' },
      },
    });

    await prisma.account.upsert({
      where: { code: '2100' },
      update: {},
      create: {
        id: CUSTOMER_DEPOSITS_ACCOUNT_ID,
        code: '2100',
        name: 'Customer Deposits Test Account',
        type: AccountType.LIABILITY,
        normalBalance: Direction.CREDIT,
        metadata: { source: 'ledger-immutability-test' },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects UPDATE to posted journal entry fields (description)', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-edit-desc`);
    try {
      await prisma.journalEntry.update({ where: { id: entryId }, data: { description: 'HACKED' } });
      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_ENTRY_IMMUTABLE');
      expect(String(error)).toContain('posted journal entries cannot be modified');
    }
  });

  it('rejects UPDATE to posted journal entry fields (reference)', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-edit-ref`);
    try {
      await prisma.journalEntry.update({ where: { id: entryId }, data: { reference: 'HACKED-REF' } });
      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_ENTRY_IMMUTABLE');
    }
  });

  it('rejects UPDATE to posted journal entry fields (currency)', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-edit-currency`);
    try {
      await prisma.journalEntry.update({ where: { id: entryId }, data: { currency: 'USD' } });
      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_ENTRY_IMMUTABLE');
    }
  });

  it('rejects UPDATE to posted journal entry fields (status)', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-edit-status`);
    try {
      await prisma.journalEntry.update({ where: { id: entryId }, data: { status: EntryStatus.DRAFT } });
      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_ENTRY_IMMUTABLE');
    }
  });

  it('rejects DELETE of posted journal entry', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-delete`);
    try {
      await prisma.journalEntry.delete({ where: { id: entryId } });
      throw new Error('DELETE should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_ENTRY_IMMUTABLE');
      expect(String(error)).toContain('journal entries cannot be deleted');
    }
  });

  it('rejects UPDATE to journal line (direction)', async () => {
    const lineId = await createLineInPostEntry(`${prefix}-line-cant-edit`);
    try {
      await prisma.journalLine.update({ where: { id: lineId }, data: { direction: Direction.CREDIT } });
      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_LINE_IMMUTABLE');
      expect(String(error)).toContain('journal lines cannot be modified');
    }
  });

  it('rejects UPDATE to journal line (amountKobo)', async () => {
    const lineId = await createLineInPostEntry(`${prefix}-line-cant-edit-amount`);
    try {
      await prisma.journalLine.update({ where: { id: lineId }, data: { amountKobo: 999999n } });
      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_LINE_IMMUTABLE');
    }
  });

  it('rejects DELETE of journal line', async () => {
    const lineId = await createLineInPostEntry(`${prefix}-line-cant-delete`);
    try {
      await prisma.journalLine.delete({ where: { id: lineId } });
      throw new Error('DELETE should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_LINE_IMMUTABLE');
      expect(String(error)).toContain('journal lines cannot be deleted');
    }
  });

  it('allows legitimate reversal: sets reversedById once on original', async () => {
    const originalId = await createPostEntry(`${prefix}-reversal-original`);
    const reversalId = await createPostEntry(`${prefix}-reversal-new`, originalId);
    const result = await prisma.journalEntry.updateMany({
      where: { id: originalId, status: EntryStatus.POSTED, reversedById: null },
      data: { reversedById: reversalId },
    });
    expect(result.count).toBe(1);
    const original = await prisma.journalEntry.findUnique({ where: { id: originalId } });
    expect(original?.reversedById).toBe(reversalId);
  });

  it('rejects second reversal: reversedById cannot be set twice', async () => {
    const originalId = await createPostEntry(`${prefix}-double-reversal-orig`);
    const reversal1Id = await createPostEntry(`${prefix}-double-reversal-1`, originalId);
    const reversal2Id = await createPostEntry(`${prefix}-double-reversal-2`, originalId);
    const first = await prisma.journalEntry.updateMany({
      where: { id: originalId, status: EntryStatus.POSTED, reversedById: null },
      data: { reversedById: reversal1Id },
    });
    expect(first.count).toBe(1);
    try {
      await prisma.journalEntry.updateMany({ where: { id: originalId }, data: { reversedById: reversal2Id } });
      throw new Error('Second reversal should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_ENTRY_IMMUTABLE');
      expect(String(error)).toContain('reversal link may only be set once');
    }
  });

  it('rejects reversal of an entry that already has reversedById', async () => {
    const originalId = await createPostEntry(`${prefix}-already-reversed`);
    const reversal1Id = await createPostEntry(`${prefix}-already-reversed-1`, originalId);
    const reversal2Id = await createPostEntry(`${prefix}-already-reversed-2`, originalId);
    const first = await prisma.journalEntry.updateMany({
      where: { id: originalId, status: EntryStatus.POSTED, reversedById: null },
      data: { reversedById: reversal1Id },
    });
    expect(first.count).toBe(1);
    try {
      await prisma.journalEntry.updateMany({ where: { id: originalId }, data: { reversedById: reversal2Id } });
      throw new Error('Overwrite should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_ENTRY_IMMUTABLE');
      expect(String(error)).toContain('reversal link may only be set once');
    }
  });

  it('rolls back the transaction when the reversal constraint fails', async () => {
    const originalId = await createPostEntry(`${prefix}-rollback-orig`);
    const reversalId = await createPostEntry(`${prefix}-rollback-reversal`, originalId);
    const relatedId = `${prefix}-rollback-related`;
    try {
      await prisma.$transaction(async (tx) => {
        const newEntry = await tx.journalEntry.create({
          data: {
            id: relatedId,
            idempotencyKey: `${prefix}-rollback-related-idem`,
            reference: `${prefix}-rollback-related-ref`,
            description: 'Related entry',
            currency: TEST_CURRENCY,
            status: EntryStatus.POSTED,
            postedAt: new Date(),
            createdAt: new Date(),
            lines: {
              create: [
                {
                  id: `${prefix}-rollback-line-1`,
                  accountId: INVESTOR_CASH_ACCOUNT_ID,
                  direction: Direction.DEBIT,
                  amountKobo: 10000n,
                  currency: TEST_CURRENCY,
                },
                {
                  id: `${prefix}-rollback-line-2`,
                  accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
                  direction: Direction.CREDIT,
                  amountKobo: 10000n,
                  currency: TEST_CURRENCY,
                },
              ],
            },
          },
          include: { lines: true },
        });
        expect(newEntry.id).toBeDefined();
        await tx.journalEntry.updateMany({ where: { id: originalId }, data: { reversedById: reversalId } });
        await tx.journalEntry.updateMany({ where: { id: originalId }, data: { reversedById: `${prefix}-fake-reversal` } });
      });
      throw new Error('Transaction should have failed but did not');
    } catch (error) {
      expect(String(error)).toContain('JOURNAL_ENTRY_IMMUTABLE');
    }
    const relatedEntry = await prisma.journalEntry.findUnique({ where: { id: relatedId } });
    expect(relatedEntry).toBeNull();
  });
});

async function createPostEntry(idempotencyKey: string, reversalOfId?: string): Promise<string> {
  const entry = await prisma.journalEntry.create({
    data: {
      idempotencyKey,
      reference: `REF-${idempotencyKey}`,
      description: `Test entry ${idempotencyKey}`,
      currency: TEST_CURRENCY,
      status: EntryStatus.POSTED,
      postedAt: new Date(),
      reversalOfId,
      lines: {
        create: [
          { accountId: INVESTOR_CASH_ACCOUNT_ID, direction: Direction.DEBIT, amountKobo: 100000n, currency: TEST_CURRENCY },
          { accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, direction: Direction.CREDIT, amountKobo: 100000n, currency: TEST_CURRENCY },
        ],
      },
    },
    include: { lines: true },
  });
  return entry.id;
}

async function createLineInPostEntry(idempotencyKey: string): Promise<string> {
  const entry = await prisma.journalEntry.create({
    data: {
      idempotencyKey,
      reference: `REF-${idempotencyKey}`,
      description: `Test entry ${idempotencyKey}`,
      currency: TEST_CURRENCY,
      status: EntryStatus.POSTED,
      postedAt: new Date(),
      lines: {
        create: [
          { accountId: INVESTOR_CASH_ACCOUNT_ID, direction: Direction.DEBIT, amountKobo: 50000n, currency: TEST_CURRENCY },
          { accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, direction: Direction.CREDIT, amountKobo: 50000n, currency: TEST_CURRENCY },
        ],
      },
    },
    include: { lines: true },
  });
  return entry.lines[0]!.id;
}
