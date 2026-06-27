# Fortress Fund – Chart of Accounts v1

> **Status: FROZEN**  
> This is the canonical Chart of Accounts (CoA) for Fortress Fund Phase 2.  
> No account may be added, removed, or renumbered without a new versioned
> document and an Architecture Decision Record (ADR).

---

## Overview

The chart follows a **five-category, numeric hierarchy**:

| Range | Category |
|-------|----------|
| 1000–1999 | Assets |
| 2000–2999 | Liabilities |
| 3000–3999 | Equity |
| 4000–4999 | Revenue |
| 5000–5999 | Expenses |

**Normal balances** follow standard accounting convention:

| Category | Normal Balance | Increases with | Decreases with |
|----------|---------------|----------------|----------------|
| Assets | Debit | DEBIT posting | CREDIT posting |
| Liabilities | Credit | CREDIT posting | DEBIT posting |
| Equity | Credit | CREDIT posting | DEBIT posting |
| Revenue | Credit | CREDIT posting | DEBIT posting |
| Expenses | Debit | DEBIT posting | CREDIT posting |

All amounts are in **integer kobo** (e.g. ₦1,000.00 = `100000`).  
All timestamps are **UTC**.

---

## Full Chart of Accounts

### 1000 – Assets

Represent economic resources controlled by Fortress Fund.

| Account Code | Account Name | Type | Normal Balance | Description |
|--------------|-------------|------|----------------|-------------|
| **1000** | **Assets** | Category | Debit | Top-level asset category |
| 1100 | Investor Cash | Asset – Current | Debit | Cash held on behalf of investors; funded by inbound deposits |
| 1200 | Settlement Account | Asset – Current | Debit | Funds in transit during payment settlement (bank/processor float) |

#### 1100 – Investor Cash

- **Debited** when a deposit is received from an investor.
- **Credited** when funds are deployed into an investment product or withdrawn.
- Balance represents total uninvested cash across all investors.
- Per-investor balance is derived by filtering `JournalLine` by investor-tagged metadata.

#### 1200 – Settlement Account

- **Debited** when a payment is initiated at the processor/bank.
- **Credited** when settlement is confirmed and funds land in 1100.
- Represents float / funds-in-transit; should net to zero after successful settlement.

---

### 2000 – Liabilities

Represent obligations owed to investors or counterparties.

| Account Code | Account Name | Type | Normal Balance | Description |
|--------------|-------------|------|----------------|-------------|
| **2000** | **Liabilities** | Category | Credit | Top-level liability category |
| 2100 | Customer Deposits | Liability – Current | Credit | Investor cash balances held in custody |
| 2200 | Product Obligations | Liability – Current | Credit | Capital committed to active investment products |

#### 2100 – Customer Deposits

- **Credited** when a deposit is received (offsetting DR 1100 Investor Cash).
- **Debited** when an investor's funds are deployed into a product or withdrawn.
- Represents Fortress Fund's obligation to return uninvested cash to investors.
- Must always be equal in magnitude and opposite in sign to 1100 on a fund-wide basis (given signed balance convention `DEBIT - CREDIT`).

#### 2200 – Product Obligations

- **Credited** when an investment is purchased (DR 2100, CR 2200).
- **Debited** when a product matures or the investor redeems (DR 2200, CR 2100 or 1100).
- Sub-accounts may be created per product using code pattern `2200.{PRODUCT_CODE}`.
- The balance of each sub-account equals the total capital committed to that product.

---

### 3000 – Equity

Represents the residual interest of Fortress Fund's principals.

| Account Code | Account Name | Type | Normal Balance | Description |
|--------------|-------------|------|----------------|-------------|
| **3000** | **Equity** | Category | Credit | Top-level equity category |

> Sub-accounts (e.g. Retained Earnings, Share Capital) will be defined in a future
> version once the revenue recognition model is finalised.

---

### 4000 – Revenue

Represents income earned by Fortress Fund.

| Account Code | Account Name | Type | Normal Balance | Description |
|--------------|-------------|------|----------------|-------------|
| **4000** | **Revenue** | Category | Credit | Top-level revenue category |

> Sub-accounts (e.g. Management Fees, Performance Fees, Interest Income) will be
> defined in a future version aligned with the fee engine design.

---

### 5000 – Expenses

Represents costs incurred by Fortress Fund.

| Account Code | Account Name | Type | Normal Balance | Description |
|--------------|-------------|------|----------------|-------------|
| **5000** | **Expenses** | Category | Debit | Top-level expense category |

> Sub-accounts (e.g. Processor Fees, Custody Fees, Operating Expenses) will be
> defined in a future version aligned with the fee engine design.

---

## Standard Journal Patterns

These are the canonical posting patterns. All other postings must derive from these.

### Pattern 1 – Investor Deposit

Investor sends ₦X. Funds land in the settlement account, then are confirmed.

**Step A – Payment Initiated (funds in transit)**

```
DR  1200  Settlement Account    X kobo
CR  2100  Customer Deposits     X kobo
```

**Step B – Settlement Confirmed (funds cleared)**

```
DR  1100  Investor Cash         X kobo
CR  1200  Settlement Account    X kobo
```

Net effect after both steps:

```
DR  1100  Investor Cash         X kobo
CR  2100  Customer Deposits     X kobo
```

---

### Pattern 2 – Investment Purchase

Investor deploys ₦X from uninvested cash into Product P.

```
DR  2100  Customer Deposits        X kobo
CR  2200  Product Obligations      X kobo
```

---

### Pattern 3 – Product Maturity / Redemption

Product P returns principal ₦X to investor's cash balance.

```
DR  2200  Product Obligations      X kobo
CR  2100  Customer Deposits        X kobo
```

---

### Pattern 4 – Investor Withdrawal

Investor withdraws ₦X from uninvested cash.

```
DR  2100  Customer Deposits        X kobo
CR  1100  Investor Cash            X kobo
```

---

### Pattern 5 – Reversal

Any of the above patterns may be reversed by creating a new `JournalEntry` with all
debit/credit directions swapped, linking `reversalOfId` to the original entry.

```
Original entry DR/CR → Reversal entry CR/DR  (mirrored)
```

---

## Balance Derivation Rules

Balances are **never stored**. They are always computed from `JournalLine` records as a **signed** balance (`DEBIT - CREDIT`).

```sql
-- Account balance
SELECT
  SUM(CASE WHEN direction = 'DEBIT'  THEN amount_kobo ELSE 0 END) -
  SUM(CASE WHEN direction = 'CREDIT' THEN amount_kobo ELSE 0 END) AS balance_kobo
FROM journal_lines jl
JOIN journal_entries je ON jl.journal_entry_id = je.id
WHERE jl.account_id = :accountId
  AND je.status = 'POSTED';

-- Per-investor balance (using metadata tag)
SELECT
  SUM(CASE WHEN direction = 'DEBIT'  THEN amount_kobo ELSE 0 END) -
  SUM(CASE WHEN direction = 'CREDIT' THEN amount_kobo ELSE 0 END) AS balance_kobo
FROM journal_lines jl
JOIN journal_entries je ON jl.journal_entry_id = je.id
WHERE jl.account_id = :accountId           -- e.g. 2100
  AND jl.metadata->>'investorId' = :userId
  AND je.status = 'POSTED';
```

---

## Accounting Equation Invariant

At all times after every `POSTED` `JournalEntry`, the following must hold:

```
Assets (1xxx) = Liabilities (2xxx) + Equity (3xxx)
```

The `PostingEngine` must validate this invariant before marking an entry as `POSTED`.
The `PostingEngine` is a pure-TypeScript service defined in `packages/ledger-core`
(PR #2). It is the sole authority for writing `JournalEntry` and `JournalLine` records
and enforces double-entry balance, integer money, and UTC timestamp rules at the point
of write.

---

## Versioning Policy

- This document is **v1**. Breaking changes require a new file `chart-of-accounts-v2.md`.
- New sub-accounts may be added here with a changelog entry.

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| v1 | 2026-06-26 | Fortress Fund Engineering | Initial freeze — 1000, 1100, 1200, 2000, 2100, 2200, 3000, 4000, 5000 |
