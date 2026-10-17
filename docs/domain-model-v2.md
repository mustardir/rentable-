# Fortress Fund – Domain Model v2

> **Status: DRAFT FOR REVIEW**  
> **Supersedes:** `docs/domain-model-v1.md` for new multi-country functionality.  
> The v1 document remains frozen and unchanged.

## Purpose

Fortress Fund is a multi-country digital banking and investment platform, with the initial investment experience primarily targeting the United States. This version retains the v1 aggregate and ledger architecture while replacing the NGN-only monetary assumption with an explicit multi-currency minor-unit model and support for crypto assets.

## Engineering Constitution

| Rule | Constraint |
|---|---|
| Integer Money | Fiat monetary values are integer minor units for their explicit ISO 4217 currency. |
| Crypto Amounts | Crypto asset quantities use integer base units with an explicit asset/network identifier; never floating-point arithmetic. |
| Currency/Asset Explicit | Every monetary or crypto amount crossing a domain/API/ledger boundary carries an explicit currency or asset code. |
| No Floating Point | Financial and asset arithmetic must not use floating-point or decimal JavaScript arithmetic. |
| Double-Entry | Every posted journal entry is balanced; each currency/asset bucket is balanced independently. |
| Immutable History | `journal_entries` and `journal_lines` are append-only. Corrections use reversals. |
| Derived State | Balances and portfolio positions are derived from immutable journal lines. |
| UTC Everywhere | Financial timestamps are stored and processed in UTC. |
| Ledger Authority | PostgreSQL journal records are the financial source of truth. External providers, custodians, payment processors, wallets and exchanges are adapters only. |
| Explicit FX | Fiat/fiat and crypto/fiat conversions require an explicit exchange rate, quote/reference, fees and execution timestamp. |

## Monetary and Digital-Asset Model

A fiat amount is:

```text
FiatMoney = { currency: ISO4217, amountMinor: bigint }
```

The minor-unit scale comes from the currency, not from a global NGN assumption. Examples:

| Currency | Minor unit | Example |
|---|---|---|
| USD | cent | $50.00 = `5_000` |
| EUR | cent | €50.00 = `5_000` |
| GBP | penny | £50.00 = `5_000` |
| NGN | kobo | ₦50.00 = `5_000` |

Crypto assets use base units appropriate to the asset/network:

```text
CryptoAmount = {
  asset: string,
  network: string,
  amountBase: bigint
}
```

For example, BTC and ETH quantities are represented in their smallest supported base unit rather than as JavaScript floating-point numbers. The exact asset precision is defined by the supported asset/network registry.

Crypto assets are **not** treated as ISO 4217 currencies. They have their own asset/network identity and custody/deposit rules.

## Aggregate Map

```text
Identity & Access
User ─── InvestorProfile
          │
          ▼
Wallet / Asset Accounts
Fiat Accounts ─── Crypto Asset Accounts
          │
          ▼
Ledger Core
JournalEntry ─── JournalLine ─── Account
          │
          ├── Deposit
          ├── Investment Subscription
          └── Exchange / Swap
          │
          ▼
Product
FinancialProduct
          │
          ▼
Audit
AuditEvent (append-only, hash-chained)
```

## Core Entities

### User

Same identity and access semantics as v1: immutable user ID, unique normalized email, password hash, role, active flag, and UTC timestamps.

### InvestorProfile

Same financial identity semantics as v1. `country` remains ISO 3166-1 alpha-2 and KYC approval remains a prerequisite for financial activity, subject to country-specific eligibility rules.

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
- A subscription amount must use exactly the product currency after any explicitly authorized conversion.
- Product deactivation does not alter existing positions.

### JournalEntry

Retains v1 immutability and idempotency requirements. A posted entry has one financial unit context, and lines belonging to the same entry must not silently mix incompatible currencies/assets. Multi-asset operations use separate balanced postings or an explicitly defined conversion journal structure.

### JournalLine

Retains v1 direction and append-only rules. Fiat monetary amount is represented as a positive integer minor-unit amount together with currency. Crypto amount is represented as a positive integer base-unit amount together with asset and network.

Balances are always derived separately by asset/currency:

```text
balance(accountId, currency) =
  SUM(debits in currency) - SUM(credits in currency)

balance(accountId, cryptoAsset, network) =
  SUM(debits in asset/network) - SUM(credits in asset/network)
```

No cross-currency or cross-asset summation is permitted.

### AuditEvent

Retains the v1 append-only, hash-chained audit model. Deposit, withdrawal, exchange quote, exchange execution, swap, fee, crypto transfer and investment purchase events must be auditable.

## Deposit and Crypto Funding

Investors may fund their platform accounts with supported fiat currencies and supported cryptocurrencies, subject to country, KYC/AML, sanctions, asset, network and provider eligibility rules.

A crypto deposit must identify at minimum:

- asset code;
- blockchain/network;
- base-unit amount;
- transaction hash or provider reference;
- destination account/wallet;
- confirmation/finality state;
- custody/provider reference where applicable.

The external wallet/custodian/payment provider is an adapter. The provider's confirmation does not replace the internal ledger record.

Crypto deposits become financially available only after the platform's configured confirmation/finality policy is satisfied. The resulting ledger posting must preserve the original crypto asset/network rather than converting it implicitly.

## Investment Subscription

An investment subscription is a domain operation that validates a requested `FiatMoney` amount against an active `FinancialProduct` before creating the corresponding ledger posting.

Required validation order:

1. Investor is eligible under KYC/access/country rules.
2. Product exists and is `ACTIVE`.
3. Funding asset/currency is compatible with the subscription route.
4. If the funding asset differs from the product currency, an explicit exchange/conversion must execute first.
5. Product-currency amount is a positive integer minor-unit amount.
6. Product-currency amount is greater than or equal to `minimumAmountMinor`.
7. Only then is the investment allocation posted through the ledger boundary.

For the initial Fortress Investment product:

```text
currency = USD
minimumAmountMinor = 5_000
minimum = $50.00
```

A request for `$49.99` (`4_999`) must be rejected. A request for `$50.00` (`5_000`) must be accepted. An investor may fund an investment using supported crypto only through an explicit conversion path that produces at least `5_000` USD cents after the applicable quote, fees and rounding rules.

## Currency Exchange and Swap

Fortress Fund supports investor-initiated currency exchange/swap between supported fiat currencies and supported crypto assets where legally and operationally permitted.

An exchange operation is a distinct domain transaction, not a mutation of an existing balance. It must contain:

- source asset/currency and integer amount;
- destination asset/currency and integer amount;
- quoted/executed exchange rate;
- quote identifier and/or provider reference;
- fee/spread, represented explicitly;
- execution timestamp (UTC);
- idempotency key;
- source and destination accounts;
- execution status.

The platform must never infer an exchange rate from the two numeric amounts alone after the fact.

For example:

```text
USD 100.00
    ↓ explicit quote/rate + fee
EUR 91.xx
```

The exact destination amount is determined by the locked execution quote and fee policy. No floating-point arithmetic is permitted.

Crypto/fiat and crypto/crypto conversions follow the same rule. Each side remains independently identifiable in the ledger, and any valuation in a reporting currency is a derived market-value calculation rather than a change to the underlying asset balance.

## Exchange Ledger Boundary

An exchange must produce an auditable set of balanced ledger postings. The implementation may use a dedicated exchange clearing account and fee account, but it must preserve:

1. the source asset leaving the investor account;
2. the destination asset entering the investor account;
3. explicit exchange/clearing amounts;
4. explicit fees/spread;
5. the provider/quote reference;
6. an immutable audit event.

Cross-asset balancing is represented through the exchange transaction's defined conversion/clearing accounts; the system must not pretend that USD cents and BTC base units are directly comparable quantities.

## Deposit → Exchange → Investment Lifecycle

```text
KYC approved
  → InvestorProfile eligible
  → fiat/crypto wallet or payment adapter
  → Deposit received
  → provider confirmation/finality
  → JournalEntry posted in deposit asset

Optional exchange/swap
  → explicit quote + rate + fees
  → source asset debited
  → destination asset credited
  → AuditEvent(exchange.executed)

Investment purchase
  → funding asset converted to product currency if required
  → product/currency/minimum validation
  → JournalEntry posted for investment allocation
  → AuditEvent(investment.purchased)
  → Portfolio position derived from journal lines
```

The investment service must not mutate a stored balance or portfolio position as a shortcut.

## API Contract Principles

- Monetary request objects must contain `currency` and `amountMinor`.
- Crypto request objects must contain `asset`, `network` and `amountBase`.
- API adapters may accept human-facing decimal strings, but conversion to validated integer units must happen at the currency/asset boundary before domain arithmetic.
- Exchange requests must include source and destination assets, quote/rate context, fees and an idempotency key.
- Currency/asset mismatch errors must be explicit and deterministic.
- Unsupported assets, networks and jurisdictions must be rejected before funds are credited or exchanged.

## Testing Requirements

At minimum, the implementation must cover:

1. USD `$50.00` accepted.
2. USD `$49.99` rejected.
3. USD `$50.01` accepted.
4. NGN amount is not numerically compared with the USD minimum.
5. Currency mismatch is rejected.
6. Zero and negative minor-unit amounts are rejected.
7. Supported crypto deposit records asset, network and base-unit amount exactly.
8. Unsupported crypto asset/network is rejected.
9. Crypto deposit is unavailable until required confirmation/finality is reached.
10. Exchange requires an explicit quote/rate and fee context.
11. Exchange is idempotent and cannot create duplicate postings.
12. Crypto-to-fiat exchange preserves source and destination asset identities.
13. Posted ledger entries remain balanced and immutable.
14. Repeated idempotency keys do not create duplicate financial postings.

## Versioning Policy

This is v2. Breaking changes to this document require `domain-model-v3.md` and a new ADR. The frozen v1 document is preserved for historical/reference purposes.

| Version | Date | Summary |
|---|---|---|
| v1 | 2026-06-26 | Original frozen model with NGN/kobo monetary assumptions |
| v2 | 2026-08-22 | Multi-country currency-aware integer minor-unit model; initial USD investment minimum $50; crypto deposits and exchange/swap support |
