# ADR 0001: Multi-Currency Integer Money and Digital Assets

- **Status:** Accepted
- **Date:** 2026-08-22
- **Supersedes:** monetary assumptions in `docs/domain-model-v1.md` for new multi-country work

## Context

Fortress Fund is a multi-country platform, with the initial investment product targeted primarily at the United States. The frozen v1 domain model expresses monetary amounts as NGN kobo, which is too narrow for a multi-currency ledger and for a USD-denominated investment product.

Investors must also be able to deposit supported cryptocurrencies and exchange/swap supported fiat and crypto assets where permitted by jurisdiction, KYC/AML, sanctions, asset, network and provider policies.

## Decision

1. Every fiat monetary amount is represented as an integer **minor-unit amount** plus an explicit ISO 4217 currency code.
2. Currency-specific minor units are authoritative. Examples:
   - USD: cents (`$50.00` = `5_000`)
   - EUR: cents
   - GBP: pence
   - NGN: kobo
3. Crypto assets are **not** ISO 4217 currencies. Crypto quantities are represented as integer **base units** with explicit asset and blockchain/network identity.
4. No floating-point arithmetic and no JavaScript `number` values are permitted for persisted or ledger financial amounts. Use integer/`bigint` representations.
5. Cross-currency and cross-asset operations require an explicit exchange/conversion boundary. The system must never silently compare, add, or convert different assets.
6. Exchange/swap execution must retain the source asset, destination asset, integer quantities, explicit quote/rate, fees/spread, provider/quote reference, execution timestamp and idempotency key.
7. Crypto deposits must retain asset, network, base-unit quantity, transaction hash/provider reference, destination account and confirmation/finality state. External wallets, custodians and payment/exchange providers are adapters only; the internal ledger remains authoritative.
8. Product minimums are expressed in the product currency. The initial Fortress Investment product minimum is **USD 5,000 minor units ($50.00)**.
9. If an investor funds a USD investment with crypto, an explicit conversion must execute first and the resulting USD amount after applicable fees/rounding must satisfy the `$50.00` minimum.
10. Double-entry ledger rules remain unchanged: every posted journal entry balances exactly within its defined financial-unit context, journal history is immutable, and balances/positions are derived from journal lines.
11. The frozen v1 document remains unchanged. The v2 document is the canonical model for new multi-country and digital-asset work.

## Consequences

- Product, deposit, wallet and exchange APIs must carry currency or asset/network identity explicitly.
- Validation must reject currency/asset mismatches before monetary comparison or posting.
- Crypto balances are maintained separately from fiat balances and are never numerically summed with fiat.
- Exchange operations require deterministic integer-unit calculations and auditable pricing context.
- Supported-asset/network and jurisdiction rules become explicit platform policy boundaries.
- Tests must cover USD, NGN, currency mismatch, crypto deposits, unsupported assets/networks, exchange quotes, fees and idempotency.

## Rejected alternatives

- **Keep kobo as the universal unit:** rejected because USD cents and other currencies cannot be represented correctly.
- **Use decimal strings/floats for ledger arithmetic:** rejected because this violates the integer-money engineering constitution and introduces rounding risk.
- **Treat crypto as ISO currencies:** rejected because asset/network identity and custody semantics would be lost.
- **Implicitly convert deposits during investment purchase:** rejected because exchange pricing, fees and auditability must be explicit.
- **Create separate ledger implementations for each currency/asset:** rejected because the ledger infrastructure remains shared while financial-unit identity is explicit on accounts/postings.
