/**
 * Integration tests for ledger immutability fortress_guard triggers.
 *
 * This suite validates that the PostgreSQL triggers enforce append-only
 * journal history: posted entries cannot be edited or deleted, and
 * reversals follow the strict 1→1 link protocol.
 *
 * Database: PostgreSQL with migration applied
 */

import { PrismaClient, EntryStatus, Direction } from '@prisma/client';

const prisma = new PrismaClient();
const DATABASE_URL = process.env.DATABASE_URL;

// Skip tests if no database URL
const describePrisma = DATABASE_URL ? describe : describe.skip;

describePrisma('Fortress Ledger Immutability (PostgreSQL Triggers)', () => {
  // Unique prefix to avoid collisions in cleanup
  const prefix = `ledger-immutable-${Date.now()}-${process.pid}`;

  // Housekeeping: clean up all test entries after suite
  afterAll(async () => {
    await prisma.journalEntry.deleteMany({
      where: {
        idempotencyKey: { startsWith: prefix },
      },
    });
    await prisma.$disconnect();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Posted JournalEntry cannot be edited
  // ─────────────────────────────────────────────────────────────────────────

  it('rejects UPDATE to posted journal entry fields (description)', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-edit-desc`);

    try {
      await prisma.journalEntry.update({
        where: { id: entryId },
        data: { description: 'HACKED: New description' },
      });

      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_ENTRY_IMMUTABLE');
      expect(errorMsg).toContain('posted journal entries cannot be modified');
    }
  });

  it('rejects UPDATE to posted journal entry fields (reference)', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-edit-ref`);

    try {
      await prisma.journalEntry.update({
        where: { id: entryId },
        data: { reference: 'HACKED-REF-1' },
      });

      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_ENTRY_IMMUTABLE');
    }
  });

  it('rejects UPDATE to posted journal entry fields (currency)', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-edit-currency`);

    try {
      await prisma.journalEntry.update({
        where: { id: entryId },
        data: { currency: 'USD' },
      });

      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_ENTRY_IMMUTABLE');
    }
  });

  it('rejects UPDATE to posted journal entry fields (status)', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-edit-status`);

    try {
      await prisma.journalEntry.update({
        where: { id: entryId },
        data: { status: EntryStatus.DRAFT },
      });

      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_ENTRY_IMMUTABLE');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Posted JournalEntry cannot be deleted
  // ─────────────────────────────────────────────────────────────────────────

  it('rejects DELETE of posted journal entry', async () => {
    const entryId = await createPostEntry(`${prefix}-cant-delete`);

    try {
      await prisma.journalEntry.delete({
        where: { id: entryId },
      });

      throw new Error('DELETE should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_ENTRY_IMMUTABLE');
      expect(errorMsg).toContain('journal entries cannot be deleted');
    }
  });

  // ──────────────────────────────────────────────────────���──────────────────
  // Test 3: JournalLine cannot be edited
  // ─────────────────────────────────────────────────────────────────────────

  it('rejects UPDATE to journal line (direction)', async () => {
    const lineId = await createLineInPostEntry(`${prefix}-line-cant-edit`);

    try {
      await prisma.journalLine.update({
        where: { id: lineId },
        data: { direction: Direction.CREDIT }, // flip direction
      });

      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_LINE_IMMUTABLE');
      expect(errorMsg).toContain('journal lines cannot be modified');
    }
  });

  it('rejects UPDATE to journal line (amountKobo)', async () => {
    const lineId = await createLineInPostEntry(`${prefix}-line-cant-edit-amount`);

    try {
      await prisma.journalLine.update({
        where: { id: lineId },
        data: { amountKobo: 999999n },
      });

      throw new Error('UPDATE should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_LINE_IMMUTABLE');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: JournalLine cannot be deleted
  // ─────────────────────────────────────────────────────────────────────────

  it('rejects DELETE of journal line', async () => {
    const lineId = await createLineInPostEntry(`${prefix}-line-cant-delete`);

    try {
      await prisma.journalLine.delete({
        where: { id: lineId },
      });

      throw new Error('DELETE should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_LINE_IMMUTABLE');
      expect(errorMsg).toContain('journal lines cannot be deleted');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Legitimate reversal succeeds (reversedById set once)
  // ─────────────────────────────────────────────────────────────────────────

  it('allows legitimate reversal: sets reversedById once on original, creates reversal entry', async () => {
    const originalId = await createPostEntry(`${prefix}-reversal-original`);
    const reversalId = await createPostEntry(`${prefix}-reversal-new`, originalId);

    // Link the reversal via updateMany (as the trigger allows)
    const result = await prisma.journalEntry.updateMany({
      where: {
        id: originalId,
        status: EntryStatus.POSTED,
        reversedById: null,
      },
      data: { reversedById: reversalId },
    });

    expect(result.count).toBe(1);

    // Verify the link was set
    const original = await prisma.journalEntry.findUnique({ where: { id: originalId } });
    expect(original?.reversedById).toBe(reversalId);

    const reversal = await prisma.journalEntry.findUnique({ where: { id: reversalId } });
    expect(reversal?.reversalOfId).toBe(originalId);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: Second reversal fails (reversedById already set)
  // ─────────────────────────────────────────────────────────────────────────

  it('rejects second reversal: reversedById cannot be set twice', async () => {
    const originalId = await createPostEntry(`${prefix}-double-reversal-orig`);
    const reversal1Id = await createPostEntry(`${prefix}-double-reversal-1`, originalId);
    const reversal2Id = await createPostEntry(`${prefix}-double-reversal-2`, originalId);

    // First reversal succeeds
    let result = await prisma.journalEntry.updateMany({
      where: {
        id: originalId,
        status: EntryStatus.POSTED,
        reversedById: null,
      },
      data: { reversedById: reversal1Id },
    });
    expect(result.count).toBe(1);

    // Second reversal fails via trigger
    try {
      result = await prisma.journalEntry.updateMany({
        where: { id: originalId },
        data: { reversedById: reversal2Id },
      });

      throw new Error('Second reversal should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_ENTRY_IMMUTABLE');
      expect(errorMsg).toContain('reversal link may only be set once');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7: Reversal attempt on already-reversed entry fails
  // ─────────────────────────────────────────────────────────────────────────

  it('rejects reversal of an entry that has OLD.reversedById already set', async () => {
    const originalId = await createPostEntry(`${prefix}-already-reversed`);
    const reversal1Id = await createPostEntry(`${prefix}-already-reversed-1`, originalId);
    const reversal2Id = await createPostEntry(`${prefix}-already-reversed-2`, originalId);

    // Set reversedById the first time
    let result = await prisma.journalEntry.updateMany({
      where: {
        id: originalId,
        status: EntryStatus.POSTED,
        reversedById: null,
      },
      data: { reversedById: reversal1Id },
    });
    expect(result.count).toBe(1);

    // Try to update reversedById again (to a different reversal) → fails
    try {
      result = await prisma.journalEntry.updateMany({
        where: { id: originalId },
        data: { reversedById: reversal2Id },
      });

      throw new Error('Overwrite should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_ENTRY_IMMUTABLE');
      expect(errorMsg).toContain('reversal link may only be set once');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 8: Rollback on constraint violation
  // ─────────────────────────────────────────────────────────────────────────

  it('rolls back entire transaction if trigger constraint fails mid-transaction', async () => {
    const originalId = await createPostEntry(`${prefix}-rollback-orig`);
    const reversalId = await createPostEntry(`${prefix}-rollback-reversal`, originalId);

    // Start a transaction that will fail partway through
    try {
      await prisma.$transaction(async (tx) => {
        // First: try to create a related record (should work)
        const newEntry = await tx.journalEntry.create({
          data: {
            id: `${prefix}-rollback-related`,
            idempotencyKey: `${prefix}-rollback-related-idem`,
            reference: `${prefix}-rollback-related-ref`,
            description: 'Related entry',
            currency: 'NGN',
            status: EntryStatus.POSTED,
            postedAt: new Date(),
            createdAt: new Date(),
            lines: {
              create: [
                {
                  id: `${prefix}-rollback-line-1`,
                  accountId: 'acct-test-1100',
                  direction: Direction.DEBIT,
                  amountKobo: 10000n,
                },
              ],
            },
          },
          include: { lines: true },
        });
        expect(newEntry.id).toBeDefined();

        // Second: try to violate the reversal link constraint → rolls back entire tx
        await tx.journalEntry.updateMany({
          where: { id: originalId },
          data: { reversedById: reversalId },
        });

        // Try to set reversedById again → violates constraint
        await tx.journalEntry.updateMany({
          where: { id: originalId },
          data: { reversedById: `${prefix}-fake-reversal` },
        });
      });

      throw new Error('Transaction should have failed but did not');
    } catch (error) {
      const errorMsg = String(error);
      expect(errorMsg).toContain('JOURNAL_ENTRY_IMMUTABLE');
    }

    // Verify the related entry was not created (rollback worked)
    const relatedEntry = await prisma.journalEntry.findUnique({
      where: { id: `${prefix}-rollback-related` },
    });
    expect(relatedEntry).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a minimal POSTED journal entry with one debit line.
 */
async function createPostEntry(
  idempotencyKey: string,
  reversalOfId?: string,
): Promise<string> {
  const entry = await prisma.journalEntry.create({
    data: {
      idempotencyKey,
      reference: `REF-${idempotencyKey}`,
      description: `Test entry ${idempotencyKey}`,
      currency: 'NGN',
      status: EntryStatus.POSTED,
      postedAt: new Date(),
      reversalOfId,
      lines: {
        create: [
          {
            accountId: 'acct-test-1100',
            direction: Direction.DEBIT,
            amountKobo: 100000n,
          },
          {
            accountId: 'acct-test-2100',
            direction: Direction.CREDIT,
            amountKobo: 100000n,
          },
        ],
      },
    },
    include: { lines: true },
  });

  return entry.id;
}

/**
 * Create a POSTED journal entry and return its first line ID.
 */
async function createLineInPostEntry(idempotencyKey: string): Promise<string> {
  const entry = await prisma.journalEntry.create({
    data: {
      idempotencyKey,
      reference: `REF-${idempotencyKey}`,
      description: `Test entry ${idempotencyKey}`,
      currency: 'NGN',
      status: EntryStatus.POSTED,
      postedAt: new Date(),
      lines: {
        create: [
          {
            accountId: 'acct-test-1100',
            direction: Direction.DEBIT,
            amountKobo: 50000n,
          },
          {
            accountId: 'acct-test-2100',
            direction: Direction.CREDIT,
            amountKobo: 50000n,
          },
        ],
      },
    },
    include: { lines: true },
  });

  return entry.lines[0]!.id;
}
