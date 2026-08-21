# @fortress/audit-core

Pure-TypeScript foundation for Fortress Fund's append-only, tamper-evident audit trail.

## Invariants

- Global `sequence` is monotonic and represented as `bigint`.
- Events are append-only; the core exposes no update or delete operation.
- Each `(entityType, entityId)` chain links through `previousHash`.
- `hash` is SHA-256 over `sequence | eventType | entityType | entityId | canonicalPayload | previousHash`.
- JSON object keys are canonicalized before hashing so equivalent payloads produce the same digest.
- `verify()` checks global sequence continuity, per-entity hash links, and event digests.
- Event snapshots are frozen and returned payloads are cloned, preventing ordinary caller mutation.

This package is intentionally independent of NestJS and Prisma. Database persistence will be added at the application/database boundary after the core invariants are established.

CI checkpoint: canonical hash implementation fixed; workflow rerun expected on the updated branch.
