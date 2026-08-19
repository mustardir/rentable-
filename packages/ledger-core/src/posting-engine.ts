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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utcNow(): Date {
  return new Date(Date.now());
}

function isDirection(value: string): value is Direction {
  return value === "DEBIT" || value === "CREDIT";
}

function parseAmountKobo(
  raw: bigint | number
): Result<Kobo, JournalError> {
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

// ---------------------------------------------------------------------------
// PostingEngine
// ---------------------------------------------------------------------------

export class PostingEngine {
  /**
   * Validates and builds a JournalEntry from a PostCommand.
   *
   * Does NOT persist – callers must pass the returned entry to their
   * Repository. Use with IdempotencyService for safe concurrent posting.
   *
   * Returns a typed error instead of throwing.
   */
  buildEntry(command: PostCommand): Result<JournalEntry, JournalError> {
    const { idempotencyKey, lines: rawLines, postedAt } = command;

    // 1. Must have at least 2 lines
    if (!rawLines || rawLines.length < 2) {
      return err({
        kind: "EMPTY_LINES",
        message: "A journal entry requires at least 2 lines (one debit, one credit)",
      });
    }

    // 2. Parse and validate each line
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
      if (!amountResult.ok) {
        return err(amountResult.error);
      }

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

    // 3. Verify double-entry balance: Σ(debits) == Σ(credits)
    let totalDebit = 0n;
    let totalCredit = 0n;

    for (const line of parsedLines) {
      if (line.direction === "DEBIT") {
        totalDebit += line.amountKobo;
      } else {
        totalCredit += line.amountKobo;
      }
    }

    if (totalDebit !== totalCredit) {
      return err({
        kind: "UNBALANCED_ENTRY",
        message: `Σ(debits)=${totalDebit} ≠ Σ(credits)=${totalCredit}; entry rejected`,
      });
    }

    const timestamp = postedAt ?? now;

    const entry: JournalEntry = Object.freeze({
      id: entryId,
      idempotencyKey,
      status: "POSTED",
      lines: Object.freeze(parsedLines),
      postedAt: timestamp,
      createdAt: now,
    });

    return ok(entry);
  }

  /**
   * Convenience method: build and immediately persist via the repository.
   *
   * Note: the idempotency check here is NOT atomic; concurrent callers may still
   * race unless the repository enforces a unique constraint on idempotencyKey
   * (or you wrap calls with IdempotencyService.withIdempotency()).
   */
  async post(
    command: PostCommand,
    repository: Repository
  ): Promise<Result<JournalEntry, JournalError>> {
    // Idempotency check
    const existing = await repository.findEntryByIdempotencyKey(
      command.idempotencyKey
    );
    if (existing) {
      return ok(existing);
    }

    const result = this.buildEntry(command);
    if (!result.ok) {
      return result;
    }

    await repository.saveEntry(result.value);
    return result;
  }
}
