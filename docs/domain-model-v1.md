# Fortress Fund – Domain Model v1

> **Status: FROZEN**  
> This document defines the canonical domain model for Fortress Fund Phase 2.  
> No structural changes may be made without a new versioned document and an
> Architecture Decision Record (ADR).

---

## Engineering Constitution (summary)

| Rule | Constraint |
|------|-----------|
| **Integer Money** | All monetary values are stored as integer kobo (₦1,000.00 = `100000`). No floats, doubles, or decimal JS arithmetic. |
| **Double-Entry** | Every posting satisfies Σ(debits) == Σ(credits). Unbalanced transactions are rejected at write time. |
| **Immutable History** | `journal_entries` and `journal_lines` are append-only. `UPDATE`/`DELETE` are forbidden. Corrections use reversing entries. |
| **Derived State** | Balances and portfolio positions are never stored as mutable columns. They are always computed from journal lines. |
| **UTC Everywhere** | All timestamps (`createdAt`, `postedAt`, `reconciledAt`) are stored and processed in UTC. |
| **Ledger Authority** | PostgreSQL journal records are the single source of truth. External systems (e.g. Crossmint) are adapters only. |

---

## Aggregate Map

```
┌──────────────────────────────────────────────────────────┐
│  Identity & Access                                       │
│  User ──────────── InvestorProfile                       │
└────────────────────────────┬─────────────────────────────┘
                             │ 1:many
┌────────────────────────────▼─────────────────────────────┐
│  Ledger Core                                             │
│  JournalEntry ──── JournalLine (debit / credit)          │
│                                                          │
│  Account (Chart of Accounts node)                        │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│  Product                                                 │
│  Product (investment vehicle)                            │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│  Compliance                                              │
│  AuditEvent (append-only, hash-chained)                  │
└──────────────────────────────────────────────────────────┘
```

---

## Entity Definitions

### 1. User

The authenticated identity of a platform participant.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `string` (cuid) | PK, immutable | Generated at creation |
| `email` | `string` | unique, not null | Lowercased, indexed |
| `passwordHash` | `string` | not null | bcrypt hash, never returned to client |
| `role` | `enum Role` | not null, default `USER` | `USER \| ADMIN \| COMPLIANCE` |
| `isActive` | `boolean` | not null, default `true` | Soft-disable flag |
| `createdAt` | `DateTime` (UTC) | not null, immutable | Set once at insert |
| `updatedAt` | `DateTime` (UTC) | not null | Auto-updated |

**Relationships**

- `User` 1──1 `InvestorProfile`
- `User` 1──N `AuditEvent`
- Supporting entities (not specified in this v1 contract): `Session`, `RefreshToken`, `KYCRecord`

**Invariants**

- `email` must be a valid RFC 5321 address.
- A deactivated user (`isActive = false`) cannot initiate new sessions or transactions.
- `role` elevation requires a `COMPLIANCE` or `ADMIN` actor and produces an `AuditEvent`.

---

### 2. InvestorProfile

The financial identity of a verified investor. Created only after KYC reaches `APPROVED`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `string` (cuid) | PK, immutable | |
| `userId` | `string` | FK → User, unique, not null | One profile per user |
| `firstName` | `string` | not null | Legal name |
| `lastName` | `string` | not null | Legal name |
| `phone` | `string` | nullable | E.164 format |
| `dateOfBirth` | `Date` (UTC midnight) | not null | Stored as `YYYY-MM-DD 00:00:00 UTC`; time component is always midnight UTC to avoid timezone drift in age calculations |
| `country` | `string` | not null | ISO 3166-1 alpha-2 |
| `kycLevel` | `enum KYCLevel` | not null, default `TIER_0` | `TIER_0 \| TIER_1 \| TIER_2 \| TIER_3` |
| `kycApprovedAt` | `DateTime` (UTC) | nullable | Set when KYC transitions to APPROVED |
| `walletAddress` | `string` | nullable, unique | On-chain wallet (Crossmint adapter) |
| `walletCreatedAt` | `DateTime` (UTC) | nullable | Set when wallet is provisioned |
| `createdAt` | `DateTime` (UTC) | not null, immutable | |
| `updatedAt` | `DateTime` (UTC) | not null | |

**Invariants**

- Cannot be created unless the linked `User` has an `APPROVED` `KYCRecord`.
- `walletAddress` is populated by the Crossmint adapter; the ledger does not depend on it.
- `kycLevel` changes must be recorded in `AuditEvent`.

---

### 3. Product

An investment vehicle offered on the platform (e.g. fixed-income fund, real-estate pool).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `string` (cuid) | PK, immutable | |
| `code` | `string` | unique, not null | Short identifier, e.g. `FFRE-001` |
| `name` | `string` | not null | Display name |
| `description` | `string` | nullable | |
| `assetClass` | `enum AssetClass` | not null | `FIXED_INCOME \| REAL_ESTATE \| EQUITY \| MONEY_MARKET` |
| `currency` | `string` | not null, default `NGN` | ISO 4217 |
| `minimumInvestmentKobo` | `bigint` | not null | Integer kobo. Min subscription amount. |
| `targetReturnBps` | `integer` | not null | Basis points. 500 = 5.00% p.a. |
| `tenorDays` | `integer` | nullable | Lock-up period in calendar days |
| `isActive` | `boolean` | not null, default `true` | Controls subscription eligibility |
| `launchedAt` | `DateTime` (UTC) | nullable | When product opened for subscription |
| `maturesAt` | `DateTime` (UTC) | nullable | When product closes / matures |
| `obligationAccountId` | `string` | FK → Account | Maps to CoA 2200 product sub-account |
| `createdAt` | `DateTime` (UTC) | not null, immutable | |
| `updatedAt` | `DateTime` (UTC) | not null | |

**Invariants**

- `minimumInvestmentKobo` must be a positive integer.
- `targetReturnBps` must be ≥ 0.
- `tenorDays`, if set, must be > 0.
- Deactivating a product (`isActive = false`) does not affect existing positions.

---

### 4. JournalEntry

The header record of a double-entry accounting transaction. Each entry must balance.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `string` (cuid) | PK, immutable | |
| `idempotencyKey` | `string` | unique, not null | Caller-supplied; prevents duplicate posts |
| `reference` | `string` | not null | Human-readable ref, e.g. `DEP-20240101-001` |
| `description` | `string` | not null | Narrative |
| `currency` | `string` | not null, default `NGN` | ISO 4217 |
| `status` | `enum EntryStatus` | not null, default `POSTED` | `DRAFT \| POSTED \| REVERSED` |
| `postedAt` | `DateTime` (UTC) | not null | Effective accounting date |
| `reversalOfId` | `string` | nullable, FK → JournalEntry | Set on reversing entry |
| `reversedById` | `string` | nullable, FK → JournalEntry | Set on original entry when reversed |
| `metadata` | `json` | nullable | Arbitrary context (e.g. source event ID) |
| `createdAt` | `DateTime` (UTC) | not null, immutable | Wall-clock insert time |
| `createdByUserId` | `string` | nullable, FK → User | System or operator actor |

**Invariants**

- Σ(debit amounts) across all `JournalLine` records **must equal** Σ(credit amounts) before `status` may be set to `POSTED`.
- A `POSTED` entry is immutable. Its lines may not be altered.
- Reversal creates a new `JournalEntry` with mirrored lines and links both entries via `reversalOfId` / `reversedById`.
- `idempotencyKey` collision results in returning the existing entry (idempotent write).

---

### 5. JournalLine

A single debit or credit posting within a `JournalEntry`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `string` (cuid) | PK, immutable | |
| `journalEntryId` | `string` | FK → JournalEntry, not null | |
| `accountId` | `string` | FK → Account (CoA), not null | |
| `direction` | `enum Direction` | not null | `DEBIT \| CREDIT` |
| `amountKobo` | `bigint` | not null | Positive integer kobo only |
| `description` | `string` | nullable | Line-level narrative |
| `metadata` | `json` | nullable | |
| `createdAt` | `DateTime` (UTC) | not null, immutable | |

**Invariants**

- `amountKobo` must be > 0.
- `direction` is explicit; sign is never inferred from account type.
- Lines are append-only. No updates or deletes.
- A line belongs to exactly one `JournalEntry`.

**Balance derivation**

```
balance(accountId) =
  SUM(amountKobo WHERE direction = DEBIT)
  - SUM(amountKobo WHERE direction = CREDIT)
```

(Sign convention follows standard T-account rules per account normal balance.)

---

### 6. AuditEvent

An append-only, tamper-evident record of every material system action.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | `string` (cuid) | PK, immutable | |
| `sequence` | `bigint` | not null, auto-increment | Monotonically increasing global sequence |
| `actorUserId` | `string` | nullable, FK → User | `null` for system-initiated events |
| `actorRole` | `string` | nullable | Snapshot of actor's role at event time |
| `eventType` | `string` | not null | Namespaced event, e.g. `kyc.approved` |
| `entityType` | `string` | not null | Affected aggregate, e.g. `InvestorProfile` |
| `entityId` | `string` | not null | ID of the affected entity |
| `payload` | `json` | not null | Full event payload snapshot |
| `previousHash` | `string` | nullable | SHA-256 of previous event in chain |
| `hash` | `string` | not null | SHA-256(`sequence \| eventType \| entityId \| payload \| previousHash`) |
| `createdAt` | `DateTime` (UTC) | not null, immutable | |

**Invariants**

- INSERT only. `UPDATE` and `DELETE` are forbidden at the database and application layers.
- `hash` must be recomputed and verified on read to detect tampering.
- `previousHash` links events into a verifiable chain per `entityType + entityId`.
- `sequence` is used for global ordering and gap detection.

---

## Enumeration Reference

| Enum | Values |
|------|--------|
| `Role` | `USER`, `ADMIN`, `COMPLIANCE` |
| `KYCStatus` | `PENDING`, `IN_REVIEW`, `APPROVED`, `REJECTED` |
| `KYCLevel` | `TIER_0`, `TIER_1`, `TIER_2`, `TIER_3` |
| `AssetClass` | `FIXED_INCOME`, `REAL_ESTATE`, `EQUITY`, `MONEY_MARKET` |
| `EntryStatus` | `DRAFT`, `POSTED`, `REVERSED` |
| `Direction` | `DEBIT`, `CREDIT` |

---

## Lifecycle: KYC → Wallet → Deposit → Investment

```
KYC submitted
  → KYCRecord(status=IN_REVIEW)
      → AuditEvent(kyc.submitted)

KYC approved
  → KYCRecord(status=APPROVED)
  → InvestorProfile created
  → Wallet provisioned (Crossmint adapter)
  → AuditEvent(kyc.approved)
  → AuditEvent(wallet.created)

Deposit received
  → JournalEntry posted
      JournalLine: DR 1100 Investor Cash   amountKobo
      JournalLine: CR 2100 Customer Deposits amountKobo
  → AuditEvent(deposit.received)

Investment purchased
  → JournalEntry posted
      JournalLine: DR 2100 Customer Deposits  amountKobo
      JournalLine: CR 2200 Product Obligations amountKobo
  → AuditEvent(investment.purchased)

Portfolio position derived (read path, no write):
  balance(2200) grouped by product = investor's position
```

---

## Versioning Policy

- This document is **v1**. Breaking changes require a new file `domain-model-v2.md`.
- Non-breaking additive changes (new optional fields, new enum values) are appended here with a changelog entry.

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| v1 | 2026-06-26 | Fortress Fund Engineering | Initial freeze |
