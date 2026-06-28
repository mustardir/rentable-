/**
 * idempotency.ts
 *
 * Idempotency service: guarantees that a given idempotency key produces
 * exactly one journal entry, even under concurrent callers.
 *
 * Semantics:
 * - If the key has never been seen, execute the operation and persist.
 * - If the key is already recorded as POSTED, return the existing entry.
 * - Concurrent callers racing on the same key: one wins, the other
 *   receives the persisted result (check-then-act protected by a per-key
 *   in-flight lock in the in-memory implementation).
 */

import type { JournalEntry, JournalError } from "./journal-entry.js";
import type { Repository } from "./repository.js";
import type { Result } from "./money.js";
import { err } from "./money.js";

// ---------------------------------------------------------------------------
// Per-key lock map (in-process concurrency guard)
// ---------------------------------------------------------------------------

type Resolve<T> = (value: T) => void;
type QueueEntry<T> = { resolve: Resolve<T> };

/**
 * A promise-based mutex keyed by an arbitrary string.
 * Serialises concurrent calls that share the same key.
 */
export class KeyedMutex {
  private readonly queues = new Map<string, Array<QueueEntry<void>>>();
  private readonly held = new Set<string>();

  async acquire(key: string): Promise<void> {
    if (!this.held.has(key)) {
      this.held.add(key);
      return;
    }
    return new Promise<void>((resolve) => {
      let queue = this.queues.get(key);
      if (!queue) {
        queue = [];
        this.queues.set(key, queue);
      }
      queue.push({ resolve });
    });
  }

  release(key: string): void {
    const queue = this.queues.get(key);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) {
        this.queues.delete(key);
      }
      next.resolve();
    } else {
      this.held.delete(key);
      this.queues.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Idempotency service
// ---------------------------------------------------------------------------

export class IdempotencyService {
  private readonly mutex = new KeyedMutex();

  /**
   * Executes `operation` exactly once per `idempotencyKey`.
   *
   * - If the key already has a POSTED entry in the repository, returns it.
   * - Otherwise, calls `operation()`, persists the result, and returns it.
   * - Concurrent calls with the same key are serialised; the second caller
   *   receives the entry written by the first.
   */
  async withIdempotency(
    idempotencyKey: string,
    repository: Repository,
    operation: () => Promise<Result<JournalEntry, JournalError>>
  ): Promise<Result<JournalEntry, JournalError>> {
    await this.mutex.acquire(idempotencyKey);
    try {
      const existing =
        await repository.findEntryByIdempotencyKey(idempotencyKey);
      if (existing) {
        return { ok: true, value: existing };
      }

      const result = await operation();
      if (!result.ok) {
        return result;
      }

      await repository.saveEntry(result.value);
      return result;
    } finally {
      this.mutex.release(idempotencyKey);
    }
  }
}

// ---------------------------------------------------------------------------
// Standalone helper (for use outside the full service)
// ---------------------------------------------------------------------------

/**
 * Returns an error if the idempotency key is already in use.
 * Used by PostingEngine when operating without IdempotencyService.
 */
export async function checkIdempotencyKey(
  key: string,
  repository: Repository
): Promise<Result<undefined, JournalError>> {
  const existing = await repository.findEntryByIdempotencyKey(key);
  if (existing) {
    return err({
      kind: "DUPLICATE_IDEMPOTENCY_KEY",
      message: `Idempotency key already used: ${key}`,
    });
  }
  return { ok: true, value: undefined };
}
