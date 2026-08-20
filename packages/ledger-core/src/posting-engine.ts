/**
 * posting-engine.ts
 *
 * The sole authority for writing JournalEntry and JournalLine records.
 *
 * Enforces at write time:
 * - amountKobo > 0 (integer bigint; floats rejected)
 * - Σ(DEBIT amountKobo) == Σ(CREDIT amountKobo)
 * - At least 2 lines per entry (one debit + one credit minimum)
 * - All timestamps stored and processed in UTC
 * - Idempotency key uniqueness
 *
 * Does NOT depend on NestJS, Prisma, Redis, or Crossmint.
 */

import { randomUUID } from "crypto";
import type { Direction } from "./account.js";
import type {
  JournalEntry,
  JournalError,
  JournalLine,
  LineInput,
  PostCommand,
} from "./journal-entry.js";
import { ok, err, koboFromBigInt, koboFromNumber } from "./money.js";
import type { Kobo, Result } from "./money.js";
import type { Repository } from "./repository.js";

function utcNow(): Date {
  return new Date(Date.now());
}

function isDirection(value: string): value is Direction {
  return value === "DEBIT" || value === "CREDIT";
}

function parseAmountKobo(raw: bigint | number): Result<Kobo, JournalError> {
  if (typeof raw === "bigint") {
    const r = koboFromBigInt(raw);
    if (!r.ok) {
      return err({ kind: r.error.kind as JournalError["kind"], message: r.error.message });
    }
    return r;
  }

  if (!Number.isInteger(raw)) {
    return err({
      kind: "FLOAT_INPUT",
      message: `amountKobo must be an integer, got ${raw}`,
    });
  }

  const r = koboFromNumber(raw);
  if (!r.ok) {
    return err({ kind: r.error.kind as JournalError["kind"], message: r.error.message });
  }
  return r;
}

export class PostingEngine {
  buildEntry(command: PostCommand): Result<JournalEntry, JournalError> {
    const { idempotencyKey, lines: rawLines, postedAt } = command;

    if (!rawLines || rawLines.length < 2) {
      return err({
        kind: "EMPTY_LINES",
        message: "A journal entry requires at least 2 lines (one debit, one credit)",
      });
    }

    const now = utcNow();
    const entryId = randomUUID();
    const parsedLines: JournalLine[] = [];

    for (const raw of rawLines) {
      if (!isDirection(raw.direction)) {
        return err({
          kind: "INVALID_DIRECTION",
          message: `direction must be either DEBIT or CREDIT, got ${raw.direction}`,
        });
      }

      const amountResult = parseAmountKobo(raw.amountKobo);
      if (!amountResult.ok) return err(amountResult.error);

      parsedLines.push(
        Object.freeze({
          id: randomUUID(),
          journalEntryId: entryId,
          accountId: raw.accountId,
          direction: raw.direction,
          amountKobo: amountResult.value,
          metadata: Object.freeze({ ...(raw.metadata ?? {}) }),
          createdAt: now,
        })
      );
    }

    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const line of parsedLines) {
      if (line.direction === "DEBIT") totalDebit += line.amountKobo;
      else totalCredit += line.amountKobo;
    }

    if (totalDebit !== totalCredit) {
      return err({
        kind: "UNBALANCED_ENTRY",
        message: `Σ(debits)=${totalDebit} ≠ Σ(credits)=${totalCredit}; entry rejected`,
      });
    }

    const timestamp = postedAt ?? now;
    return ok(
      Object.freeze({
        id: entryId,
        idempotencyKey,
        status: "POSTED",
        lines: Object.freeze(parsedLines),
        postedAt: timestamp,
        createdAt: now,
      })
    );
  }

  /**
   * Build and persist through the repository. The repository is responsible
   * for the database-level uniqueness race; its return value is authoritative.
   */
  async post(command: PostCommand, repository: Repository): Promise<Result<JournalEntry, JournalError>> {
    const existing = await repository.findEntryByIdempotencyKey(command.idempotencyKey);
    if (existing) return ok(existing);

    const result = this.buildEntry(command);
    if (!result.ok) return result;

    try {
      const persisted = await repository.saveEntry(result.value);
      return ok(persisted);
    } catch (error) {
      // A Repository implementation that cannot resolve a uniqueness race
      // should surface its original error rather than returning a fabricated
      // JournalEntry. PrismaLedgerRepository resolves P2002 conflicts itself.
      return err({ kind: "PERSISTENCE_ERROR", message: error instanceof Error ? error.message : String(error) });
    }
  }
}
