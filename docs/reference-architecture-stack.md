# Fortress Fund — Reference Architecture Stack

This document records the external repositories used as architectural references for Fortress Fund.

These repositories are **references, not dependencies**. Fortress Fund keeps its own domain model, security model, ledger-core package, NestJS API, Prisma/PostgreSQL persistence, RBAC/KYC workflows, audit chain, and deployment architecture.

## Reference repositories

| Reference | URL | Primary use |
|---|---|---|
| SimpleBank | https://github.com/techschool/simplebank | PostgreSQL transactions, sqlc patterns, account/entry/transfer tests, concurrency testing |
| Formance Ledger | https://github.com/formancehq/ledger | Programmable financial ledger, postings, multi-leg financial transactions, ledger domain modeling |
| Blnk | https://github.com/blnkfinance/blnk | Fintech ledger, balances, multi-currency concepts, reconciliation, financial state |
| ledger-service | https://github.com/shaikn6/ledger-service | Idempotency, append-only postings, deterministic row locking, reversals, concurrency, load testing |
| Double-Entry Bank Go | https://github.com/PaulBabatuyi/double-entry-bank-Go | Go/PostgreSQL/sqlc banking backend, reconciliation, authorization, serializable transactions |
| pgledger | https://github.com/pgr0ss/pgledger | PostgreSQL-native ledger invariants, database functions/views, transactional accounting |
| Hyperswitch | https://github.com/juspay/hyperswitch | Payment orchestration, connector architecture, retries, routing, settlement and operations |
| azex-ai/ledger | https://github.com/azex-ai/ledger | Classification-driven ledger design, reservations, lifecycle state, reconciliation and advanced financial controls |

## How Fortress Fund uses the references

### Ledger correctness

Use SimpleBank, Formance, Blnk, ledger-service, pgledger, and azex-ai/ledger to challenge the Fortress Fund ledger against:

- immutable postings
- balanced double-entry rules
- positive integer minor-unit amounts
- currency isolation
- idempotency
- deterministic locking
- insufficient-funds handling
- reversals
- reservations/holds where required
- reconciliation
- database-level invariants
- concurrency and failure testing

### Payments

Use Hyperswitch as a reference for the boundary between the internal financial ledger and external payment providers. Do not couple the core ledger to a provider-specific implementation.

### Banking/API behavior

Use Double-Entry Bank Go and SimpleBank for practical transaction, authorization, persistence, testing, and API patterns while keeping Fortress Fund's stronger domain model.

## Rules

1. Do not copy an external repository wholesale into Fortress Fund.
2. Do not introduce an external repository as a runtime dependency merely because it contains a useful pattern.
3. Prefer Fortress Fund's existing ledger-core invariants when they are stronger or more appropriate.
4. Every financial invariant must have automated tests.
5. Critical invariants should have a database backstop where practical.
6. Financial history is append-only; corrections are represented by reversals/compensating entries rather than mutation of posted history.
7. All money remains integer minor units (`amountKobo`/equivalent), never floating point.
8. Reference repositories are reviewed for ideas; their licenses and security posture must be evaluated before any code is reused.

## Completion objective

The reference stack exists to accelerate the final Fortress Fund implementation, not to create an endless research phase. Once the gap audit is converted into implementation checkpoints and the resulting tests pass, repository research should stop and the project should move into release hardening.