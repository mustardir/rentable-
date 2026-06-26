# @fortress/ledger-core

Pure-TypeScript double-entry ledger core for Fortress Fund Phase 2.

> **Scope gate**: Zero runtime dependencies. No NestJS, Prisma, Redis, or Crossmint imports.
> All money is integer kobo. All timestamps are UTC.

---

## Contents

| File | Purpose |
|------|---------|
| `src/money.ts` | Branded `Kobo` type, float/zero/negative rejection |
| `src/account.ts` | `Account` types, canonical Chart of Accounts (v1) |
| `src/journal-entry.ts` | `JournalEntry` / `JournalLine` types, command objects |
| `src/posting-engine.ts` | Validates & builds entries; enforces Σ(debits)==Σ(credits) |
| `src/balance-service.ts` | Derives balances from lines (never stored) |
| `src/reversal-service.ts` | Reversal-only corrections |
| `src/repository.ts` | Pure-TS interface + `InMemoryRepository` |
| `src/idempotency.ts` | Per-key mutex, `IdempotencyService` |
| `src/index.ts` | Public API |

---

## Engineering Constitution Compliance

| Rule | How it is enforced |
|------|--------------------|
| **Integer money** | `Kobo` is a branded `bigint`; `koboFromNumber()` rejects non-integers |
| **amountKobo > 0** | `koboFromBigInt` / `koboFromNumber` reject zero and negative values |
| **Σ(debits) == Σ(credits)** | `PostingEngine.buildEntry()` rejects unbalanced entries |
| **Append-only journals** | `InMemoryRepository.saveEntry()` throws on duplicate id; no update/delete methods |
| **Reversal-only corrections** | `ReversalService.reverse()` mirrors lines; double-reversal rejected |
| **Derived balances** | `BalanceService` sums lines on every call; no stored balance field |
| **UTC everywhere** | `postedAt` / `createdAt` use `new Date(Date.now())`; callers may supply a UTC `Date` |
| **Idempotency** | `IdempotencyService` serialises concurrent callers with a per-key mutex |
| **Typed domain errors** | All errors are `Result<T, E>` — no thrown exceptions from business logic |

---

## Quick Start

```ts
import {
  PostingEngine,
  BalanceService,
  ReversalService,
  InMemoryRepository,
  IdempotencyService,
} from "@fortress/ledger-core";

const repo = new InMemoryRepository();
const engine = new PostingEngine();
const balances = new BalanceService();
const reversalSvc = new ReversalService();
const idempotency = new IdempotencyService();
```

---

## Examples

### 1 – Investor Deposit (Pattern 1B)

```ts
// DR 1100 Investor Cash  100,000 kobo  (₦1,000.00)
// CR 2100 Customer Deposits  100,000 kobo

const result = await engine.post(
  {
    idempotencyKey: "deposit-txn-abc123",
    lines: [
      { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100_000n },
      {
        accountId: "acct_2100",
        direction: "CREDIT",
        amountKobo: 100_000n,
        metadata: { investorId: "user_xyz" },
      },
    ],
  },
  repo
);

if (!result.ok) {
  console.error(result.error.kind, result.error.message);
} else {
  console.log("Posted:", result.value.id);
}
```

### 2 – Derive Account Balance

```ts
const entries = await repo.findAllEntries();

// acct_1100 is ASSET (normal balance = DEBIT)
// Returns positive value when debits exceed credits
const cashBalance = balances.getAccountBalance("acct_1100", entries);
console.log(`Investor Cash: ${cashBalance} kobo`); // 100000n
```

### 3 – Per-Investor Balance

```ts
const investorBalance = balances.getInvestorBalance(
  "acct_2100",   // Customer Deposits
  "user_xyz",    // investorId metadata tag
  entries
);
console.log(`Investor user_xyz owes: ${investorBalance} kobo`); // 100000n
```

### 4 – Reversal

```ts
const reversal = await reversalSvc.reverse(
  {
    originalEntryId: result.value.id,
    idempotencyKey: "reversal-of-deposit-abc123",
  },
  repo
);

// After reversal, both accounts net to zero
const updatedEntries = await repo.findAllEntries();
const netCash = balances.getAccountBalance("acct_1100", updatedEntries);
console.log(`Net cash after reversal: ${netCash} kobo`); // 0n
```

### 5 – Idempotent Posting

```ts
const svc = new IdempotencyService();

// Call concurrently: exactly one entry is written, all callers get the same result
const [r1, r2, r3] = await Promise.all([
  svc.withIdempotency("deposit-txn-abc123", repo, () =>
    Promise.resolve(engine.buildEntry({ idempotencyKey: "deposit-txn-abc123", lines: [...] }))
  ),
  svc.withIdempotency("deposit-txn-abc123", repo, () =>
    Promise.resolve(engine.buildEntry({ idempotencyKey: "deposit-txn-abc123", lines: [...] }))
  ),
  svc.withIdempotency("deposit-txn-abc123", repo, () =>
    Promise.resolve(engine.buildEntry({ idempotencyKey: "deposit-txn-abc123", lines: [...] }))
  ),
]);

// r1.value.id === r2.value.id === r3.value.id
```

### 6 – Rejecting Float Inputs

```ts
// Floats are rejected at construction time with a typed error
import { koboFromNumber } from "@fortress/ledger-core";

const r = koboFromNumber(100.5);
// r.ok === false
// r.error.kind === "FLOAT_INPUT"
// r.error.message === "amountKobo must be an integer, got 100.5"
```

### 7 – Typed Domain Errors

All operations return `Result<T, E>` — never throw:

```ts
import type { JournalError, MoneyError, Result } from "@fortress/ledger-core";

function handleResult(r: Result<JournalEntry, JournalError>) {
  if (!r.ok) {
    switch (r.error.kind) {
      case "FLOAT_INPUT":        // amountKobo was a float
      case "ZERO_AMOUNT":        // amountKobo was 0
      case "NEGATIVE_AMOUNT":    // amountKobo was negative
      case "UNBALANCED_ENTRY":   // Σ(debits) ≠ Σ(credits)
      case "EMPTY_LINES":        // fewer than 2 lines
      case "DUPLICATE_IDEMPOTENCY_KEY": // key already used
      case "ENTRY_NOT_FOUND":    // reversal target not found
      case "ALREADY_REVERSED":   // double-reversal attempt
      case "NOT_POSTED":         // entry is not in POSTED status
    }
  }
}
```

---

## Running Tests

```bash
pnpm test          # run with coverage (must meet ≥95% threshold)
pnpm typecheck     # TypeScript strict mode check
```

---

## Chart of Accounts (v1)

| Code | Name | Type | Normal Balance |
|------|------|------|---------------|
| 1100 | Investor Cash | Asset | DEBIT |
| 1200 | Settlement Account | Asset | DEBIT |
| 2100 | Customer Deposits | Liability | CREDIT |
| 2200 | Product Obligations | Liability | CREDIT |
| 3000 | Equity | Equity | CREDIT |
| 4000 | Revenue | Revenue | CREDIT |
| 5000 | Expenses | Expense | DEBIT |

All amounts in integer kobo (₦1,000.00 = `100_000n`).

See `docs/chart-of-accounts-v1.md` for the full frozen specification.
