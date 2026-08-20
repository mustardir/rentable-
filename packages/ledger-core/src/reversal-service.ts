/**
 * reversal-service.ts
 *
 * Posted entries are corrected exclusively by appending a reversing entry.
 * The original entry's journal lines are never changed. Reversal persistence
 * is delegated to the repository so the append + reversal link is atomic.
 */

import { randomUUID } from "crypto";
import type { JournalEntry, JournalError, ReversalCommand } from "./journal-entry.js";
import type { Kobo, Result } from "./money.js";
import { ok, err } from "./money.js";
import type { Repository } from "./repository.js";

function repositoryError(error: unknown): JournalError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("ENTRY_NOT_FOUND:")) {
    return { kind: "ENTRY_NOT_FOUND", message: `Journal entry not found: ${message.slice(17)}` };
  }
  if (message.startsWith("NOT_POSTED:")) {
    return { kind: "NOT_POSTED", message: `Only POSTED entries may be reversed: ${message.slice(11)}` };
  }
  if (message.startsWith("ALREADY_REVERSED:")) {
    return { kind: "ALREADY_REVERSED", message: `Entry was already reversed: ${message.slice(17)}` };
  }
  return { kind: "DUPLICATE_IDEMPOTENCY_KEY", message };
}

export class ReversalService {
  async reverse(
    command: ReversalCommand,
    repository: Repository
  ): Promise<Result<JournalEntry, JournalError>> {
    const { originalEntryId, idempotencyKey, reversedAt } = command;

    const existingByKey = await repository.findEntryByIdempotencyKey(idempotencyKey);
    if (existingByKey) return ok(existingByKey);

    const original = await repository.findEntryById(originalEntryId);
    if (!original) {
      return err({ kind: "ENTRY_NOT_FOUND", message: `Journal entry not found: ${originalEntryId}` });
    }
    if (original.status !== "POSTED") {
      return err({
        kind: "NOT_POSTED",
        message: `Entry ${originalEntryId} has status "${original.status}"; only POSTED entries may be reversed`,
      });
    }
    if (original.reversedById !== undefined) {
      return err({
        kind: "ALREADY_REVERSED",
        message: `Entry ${originalEntryId} was already reversed by ${original.reversedById}`,
      });
    }

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

    try {
      await repository.saveReversal(originalEntryId, reversalEntry);
      return ok(reversalEntry);
    } catch (error) {
      // A concurrent reversal can win between the initial read and the atomic
      // repository operation. Map that conflict back to a domain error.
      return err(repositoryError(error));
    }
  }
}
