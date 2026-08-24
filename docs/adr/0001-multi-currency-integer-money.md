# ADR 0001: Multi-Currency Integer Money

- **Status:** Accepted
- **Date:** 2026-08-22
- **Supersedes:** monetary assumptions in `docs/domain-model-v1.md` for new multi-country work

## Context

Fortress Fund is a multi-country platform, with the initial investment product targeted primarily at the United States. The frozen v1 domain model expresses monetary amounts as NGN kobo, which is too narrow for a multi-currency ledger and for a USD-denominated investment product.

## Decision

1. Every monetary amount is represented as an integer **minor-unit amount** plus an explicit ISO 4217 currency code.
2. Currency-specific minor units are authoritative. Examples:
   - USD: cents (`$50.00` = `5_000`)
   - EUR: cents
   - GBP: pence
   - NGN: kobo
3. No floating-point arithmetic and no JavaScript `number` values are permitted for persisted or ledger monetary amounts. Use `bigint`/integer representations.
4. Cross-currency operations require an explicit FX conversion boundary and must never silently compare or add amounts with different currencies.
5. Product minimums are expressed in the product currency. The initial Fortress Investment product minimum is **USD 5,000 minor units ($50.00)**.
6. Double-entry ledger rules remain unchanged: every posted journal entry balances exactly, journal history is immutable, and balances/positions are derived from journal lines.
7. The frozen v1 document remains unchanged. The v2 document is the canonical model for new multi-country monetary work.

## Consequences

- Product and deposit APIs must carry currency explicitly.
- Validation must reject currency mismatches before monetary comparison or posting.
- Existing NGN/kobo integrations can continue using NGN minor units without special-case ledger logic.
- Tests must cover USD, NGN, currency mismatch, minimum-boundary, and below-minimum cases.

## Rejected alternatives

- **Keep kobo as the universal unit:** rejected because USD cents and other currencies cannot be represented correctly.
- **Use decimal strings/floats for convenience:** rejected because this violates the integer-money engineering constitution and introduces rounding risk.
- **Create separate ledgers per currency:** rejected because currency is a property of monetary amounts/accounts and does not justify duplicating ledger infrastructure.
