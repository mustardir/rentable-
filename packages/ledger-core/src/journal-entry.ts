/**
 * journal-entry.ts
 *
 * Immutable domain types for JournalEntry and JournalLine.
 *
 * Invariants (enforced at write time by PostingEngine):
 * - amountKobo > 0 (integer bigint)
 * - Σ(DEBIT lines) == Σ(CREDIT lines)
 * - Entries are append-only; no UPDATE or DELETE
 * - Corrections are made via reversing entries only
 * - All timestamps are UTC
 */

import type { Direction } from "./account.js";
import type { Kobo } from "./money.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JournalEntryStatus = "PENDING" | "POSTED" | "REVERSED";

/**
 * A single debit or credit line within a journal entry.
 * Once written, lines are immutable.
 */
export interface JournalLine {
  readonly id: string;
  readonly journalEntryId: string;
  readonly accountId: string;
  readonly direction: Direction;
  /** Integer kobo amount, always > 0 */
  readonly amountKobo: Kobo;
  /** Optional arbitrary metadata tags (e.g. investorId, productId) */
  readonly metadata: Readonly<Record<string, string>>;
  readonly createdAt: Date;
}

/**
 * A complete double-entry journal entry.
 * After reaching POSTED status it becomes immutable.
 * REVERSED entries may only be corrected via a linked reversal.
 */
export interface JournalEntry {
  readonly id: string;
  /** Caller-supplied idempotency key; must be globally unique */
  readonly idempotencyKey: string;
  readonly status: JournalEntryStatus;
  readonly lines: readonly JournalLine[];
  /** Set when status transitions to POSTED */
  readonly postedAt: Date;
  /** Present when this entry reverses another */
  readonly reversalOfId?: string;
  /** Present when this entry has been reversed */
  readonly reversedById?: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export type JournalErrorKind =
  | "UNBALANCED_ENTRY"
  | "EMPTY_LINES"
  | "INVALID_AMOUNT"
  | "DUPLICATE_IDEMPOTENCY_KEY"
  | "ENTRY_NOT_FOUND"
  | "ALREADY_REVERSED"
  | "NOT_POSTED"
  | "FLOAT_INPUT"
  | "ZERO_AMOUNT"
  | "NEGATIVE_AMOUNT";

export interface JournalError {
  readonly kind: JournalErrorKind;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Input for creating one journal line */
export interface LineInput {
  readonly accountId: string;
  readonly direction: Direction;
  /** Must be an integer > 0 (bigint or safe integer number) */
  readonly amountKobo: bigint | number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Command to post a new journal entry */
export interface PostCommand {
  readonly idempotencyKey: string;
  readonly lines: readonly LineInput[];
  /** Caller-supplied UTC timestamp; defaults to now() if omitted */
  readonly postedAt?: Date;
}

/** Command to reverse an existing journal entry */
export interface ReversalCommand {
  readonly originalEntryId: string;
  readonly idempotencyKey: string;
  /** Caller-supplied UTC timestamp; defaults to now() if omitted */
  readonly reversedAt?: Date;
}
