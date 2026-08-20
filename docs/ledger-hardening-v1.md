# Ledger Hardening v1

## Invariants

- Monetary amounts are integer kobo only; no decimal monetary fields are introduced.
- Every posted journal entry has at least one debit and one credit.
- Total debit kobo must equal total credit kobo before persistence.
- Journal lines are append-only and are never edited during reversal.
- A correction is represented by a new posted reversal entry with opposite directions.
- The original entry remains `POSTED`; the reversal offsets it rather than deleting or excluding the original.
- Reversal persistence is atomic: the reversal and the original's `reversedById` link commit together.
- A journal entry can be reversed at most once.
- Idempotency keys are unique and repeated reversal requests return the existing reversal.
- Account balances are derived from posted journal lines, not mutable balance columns.

## Reversal safety

The repository owns the atomic persistence boundary. This prevents a process failure from leaving a reversal entry without the corresponding reversal link, or a reversal link without its reversal entry.

The original journal lines remain unchanged. Because both the original and reversing entry remain posted, balance derivation naturally nets the pair to zero.
