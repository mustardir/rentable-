/**
 * index.ts
 *
 * Public API for @fortress/ledger-core.
 *
 * Consumers should import from this module only.
 * Internal modules may be imported directly in tests.
 */

// Money
export {
  koboFromBigInt,
  koboFromNumber,
  addKobo,
  isValidKobo,
  ok,
  err,
} from "./money.js";
export type {
  Kobo,
  MoneyError,
  MoneyErrorKind,
  Result,
} from "./money.js";

// Accounts
export {
  findAccountById,
  findAccountByCode,
  getAllAccounts,
  normalBalanceFor,
} from "./account.js";
export type {
  Account,
  AccountType,
  AccountError,
  AccountErrorKind,
  Direction,
} from "./account.js";

// Journal entry types & commands
export type {
  JournalEntry,
  JournalLine,
  JournalEntryStatus,
  JournalError,
  JournalErrorKind,
  LineInput,
  PostCommand,
  ReversalCommand,
} from "./journal-entry.js";

// Repository
export { InMemoryRepository } from "./repository.js";
export type { Repository } from "./repository.js";

// Posting engine
export { PostingEngine } from "./posting-engine.js";

// Balance service
export { BalanceService } from "./balance-service.js";

// Reversal service
export { ReversalService } from "./reversal-service.js";

// Idempotency
export { IdempotencyService, KeyedMutex, checkIdempotencyKey } from "./idempotency.js";
