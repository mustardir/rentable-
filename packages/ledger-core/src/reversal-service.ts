/**
 * reversal-service.ts
 *
 * Reversal-only correction mechanism.
 *
 * Corrections to posted journal entries are made exclusively by creating
 * a new reversing entry with all debit/credit directions swapped.
 * The original entry is linked to the reversal via reversedById,
 * and the reversal entry carries reversalOfId.
 *
 * After reversal, the net effect of (original + reversal) is zero.
 * Reversing an already-reversed entry is rejected.
 */

import { randomUUID } from "crypto";
import type { JournalEntry, JournalError, ReversalCommand } from "./journal-entry.js";
import type { Kobo, Result } from "./money.js";
import { ok, err } from "./money.js";
import type { Repository } from "./repository.js";

// ---------------------------------------------------------------------------
// ReversalService
// ---------------------------------------------------------------------------

export class ReversalService {
  /**
   * Creates a reversing JournalEntry for the given original entry.
   *
   * Steps:
   * 1. Load the original entry from the repository.
   * 2. Validate it is POSTED and not already reversed.
   * 3. Build a mirror entry (all directions swapped, same amounts).
   * 4. Persist both the reversal entry and the updated original.
   * 5. Return the new reversal entry.
   */
  async reverse(
    command: ReversalCommand,
    repository: Repository
  ): Promise<Result<JournalEntry, JournalError>> {
    const { originalEntryId, idempotencyKey, reversedAt } = command;

    // 1. Check idempotency: if this key was already used, return existing
    const existingByKey = await repository.findEntryByIdempotencyKey(idempotencyKey);
    if (existingByKey) {
      return ok(existingByKey);
    }

    // 2. Load the original entry
    const original = await repository.findEntryById(originalEntryId);
    if (!original) {
      return err({
        kind: "ENTRY_NOT_FOUND",
        message: `Journal entry not found: ${originalEntryId}`,
      });
    }

    // 3. Must be POSTED to be reversed
    if (original.status !== "POSTED") {
      return err({
        kind: "NOT_POSTED",
        message: `Entry ${originalEntryId} has status "${original.status}"; only POSTED entries may be reversed`,
      });
    }

    // 4. Already reversed?
    if (original.reversedById !== undefined) {
      return err({
        kind: "ALREADY_REVERSED",
        message: `Entry ${originalEntryId} was already reversed by ${original.reversedById}`,
      });
    }

    // 5. Build the reversing entry
    const now = reversedAt ?? new Date(Date.now());
    const reversalId = randomUUID();

    const mirroredLines = original.lines.map((line) =>
      Object.freeze({
        id: randomUUID(),
        journalEntryId: reversalId,
        accountId: line.accountId,
        direction: line.direction === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
        amountKobo: line.amountKobo as Kobo,
        metadata: Object.freeze({ ...line.metadata }),
        createdAt: now,
      })
    );

    const reversalEntry: JournalEntry = Object.freeze({
      id: reversalId,
      idempotencyKey,
      status: "POSTED",
      lines: Object.freeze(mirroredLines),
      postedAt: now,
      reversalOfId: originalEntryId,
      createdAt: now,
    });

    // 6. Persist the reversal entry
    await repository.saveEntry(reversalEntry);

    // 7. Mark the original as reversed
    await repository.markReversed(originalEntryId, reversalId);

    return ok(reversalEntry);
  }
}
