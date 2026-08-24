# Fortress Fund – Domain Model v2

> **Status: DRAFT FOR REVIEW**  
> **Supersedes:** `docs/domain-model-v1.md` for new multi-country functionality.  
> The v1 document remains frozen and unchanged.

## Purpose

Fortress Fund is a multi-country digital banking and investment platform, with the initial investment experience primarily targeting the United States. This version retains the v1 aggregate and ledger architecture while replacing the NGN-only monetary assumption with an explicit multi-currency minor-unit model.

## Engineering Constitution

| Rule | Constraint |
|---|---|
| Integer Money | All monetary values are integer minor units for their explicit ISO 4217 currency. |
| Currency Explicit | Every monetary value crossing a domain/API/ledger boundary carries a currency code. |
| No Floating Point | Monetary arithmetic must not use floating-point or decimal JavaScript arithmetic. |
| Double-Entry | Every posted journal entry satisfies Σ debits == Σ credits in one currency. |
| Immutable History | `journal_entries` and `journal_lines` are append-only. Corrections use reversals. |
| Derived State | Balances and portfolio positions are derived from immutable journal lines. |
| UTC Everywhere | Financial timestamps are stored and processed in UTC. |
| Ledger Authority | PostgreSQL journal records are the financial source of truth. External providers are adapters only. |

## Monetary Model

A monetary amount is the pair:

```text
Money = { currency: ISO4217, amountMinor: bigint }
```

The minor-unit scale comes from the currency, not from a global NGN assumption. Examples:

| Currency | Minor unit | Example |
|---|---|---|
| USD | cent | $50.00 = `5_000` |
| EUR | cent | €50.00 = `5_000` |
| GBP | penny | £50.00 = `5_000` |
| NGN | kobo | ₦50.00 = `5_000` |

For currencies with different ISO minor-unit rules, the ISO currency definition is authoritative. Domain code must not infer scale from the numeric amount.

## Aggregate Map

```text
Identity & Access
User ─── InvestorProfile
          │
          ▼
Ledger Core
JournalEntry ─── JournalLine ─── Account
          │
          ▼
Product
FinancialProduct
          │
          ▼
Investment Subscription
Investor ─── Product ─── Money(currency + minor units)
          │
          ▼
Audit
AuditEvent (append-only, hash-chained)
```

## Core Entities

### User

Same identity and access semantics as v1: immutable user ID, unique normalized email, password hash, role, active flag, and UTC timestamps.

### InvestorProfile

Same financial identity semantics as v1. `country` remains ISO 3166-1 alpha-2 and KYC approval remains a prerequisite for financial activity.

### FinancialProduct

The v2 application model corresponds to the v1 Product aggregate but supports multi-country monetary values.

| Field | Type | Constraints |
|---|---|---|
| `id` | string | immutable PK |
| `code` | string | unique, required |
| `name` | string | required |
| `description` | string | nullable |
| `type` | enum | `SAVINGS \| INVESTMENT \| FIXED_INCOME \| OTHER` |
| `currency` | ISO 4217 string | required |
| `minimumAmountMinor` | bigint | positive integer |
| `targetReturnBps` | integer | >= 0 when supplied |
| `tenorDays` | integer | > 0 when supplied |
| `status` | enum | `DRAFT \| ACTIVE \| SUSPENDED \| CLOSED` |
| `metadata` | json | optional |
| `createdAt` / `updatedAt` | UTC DateTime | required |

**Invariants**

- `currency` is normalized to an uppercase ISO 4217 code.
- `minimumAmountMinor > 0`.
- A subscription amount must use exactly the product currency.
- Product deactivation does not alter existing positions.

### JournalEntry

Retains v1 immutability and idempotency requirements. A posted entry has exactly one currency and all its lines use that same currency.

### JournalLine

Retains v1 direction and append-only rules. Monetary amount is represented as a positive integer minor-unit amount and is interpreted together with the parent journal entry currency.

```text
balance(accountId, currency) =
  SUM(debits in currency) - SUM(credits in currency)
```

No cross-currency summation is permitted.

### AuditEvent

Retains the v1 append-only, hash-chained audit model.

## Investment Subscription

An investment subscription is a domain operation that validates a requested `Money` amount against an active `FinancialProduct` before creating the corresponding ledger posting.

Required validation order:

1. Investor is eligible under KYC/access rules.
2. Product exists and is `ACTIVE`.
3. Request currency equals product currency.
4. Request amount is a positive integer minor-unit amount.
5. Request amount is greater than or equal to `minimumAmountMinor`.
6. Only then is the financial transaction posted through the ledger boundary.

For the initial Fortress Investment product:

```text
currency = USD
minimumAmountMinor = 5_000
minimum = $50.00
```

A request for `$49.99` (`4_999`) must be rejected. A request for `$50.00` (`5_000`) must be accepted. A request expressed in NGN must not be compared numerically against the USD minimum; it must be rejected as a currency mismatch unless an explicit FX conversion workflow is introduced.

## Deposit → Investment Lifecycle

```text
KYC approved
  → InvestorProfile eligible
  → wallet/payment adapter receives funds
  → Deposit received
  → JournalEntry posted in deposit currency
  → Investment subscription requested
  → product/currency/minimum validation
  → JournalEntry posted for investment allocation
  → AuditEvent(investment.purchased)
  → Portfolio position derived from journal lines
```

The investment service must not mutate a stored balance or portfolio position as a shortcut.

## API Contract Principles

- Monetary request objects must contain `currency` and `amountMinor`.
- API adapters may accept human-facing decimal strings such as `"50.00"`, but conversion to minor units must happen at a validated currency boundary before domain arithmetic.
- API responses should expose both currency and minor-unit amount, with display formatting handled outside the ledger/domain arithmetic.
- Currency mismatch errors must be explicit and deterministic.

## Testing Requirements

At minimum, the implementation must cover:

1. USD `$50.00` accepted.
2. USD `$49.99` rejected.
3. USD `$50.01` accepted.
4. NGN amount is not numerically compared with the USD minimum.
5. Currency mismatch is rejected.
6. Zero and negative minor-unit amounts are rejected.
7. Posted ledger entries remain balanced and immutable.
8. Repeated idempotency keys do not create duplicate financial postings.

## Versioning Policy

This is v2. Breaking changes to this document require `domain-model-v3.md` and a new ADR. The frozen v1 document is preserved for historical/reference purposes.

| Version | Date | Summary |
|---|---|---|
| v1 | 2026-06-26 | Original frozen model with NGN/kobo monetary assumptions |
| v2 | 2026-08-22 | Multi-country currency-aware integer minor-unit model; initial USD investment minimum $50 |
