/**
 * repository.ts
 *
 * Pure-TypeScript repository interface and an in-memory implementation.
 *
 * Journal entries and lines are append-only. Reversal metadata is the only
 * allowed mutation to an existing entry, and reversal persistence is atomic.
 */

import type { JournalEntry } from "./journal-entry.js";

export interface Repository {
  /**
   * Atomically persists an entry and returns the authoritative persisted entry.
   * Implementations must return the existing entry when an idempotency-key
   * race is won by another caller.
   */
  saveEntry(entry: JournalEntry): Promise<JournalEntry>;
  findEntryById(id: string): Promise<JournalEntry | undefined>;
  findEntryByIdempotencyKey(key: string): Promise<JournalEntry | undefined>;
  findAllEntries(): Promise<readonly JournalEntry[]>;

  /** Atomically appends a reversal and marks the original as reversed. */
  saveReversal(originalEntryId: string, reversal: JournalEntry): Promise<void>;
}

export class InMemoryRepository implements Repository {
  private readonly byId = new Map<string, JournalEntry>();
  private readonly byIdempotencyKey = new Map<string, JournalEntry>();

  async saveEntry(entry: JournalEntry): Promise<JournalEntry> {
    if (this.byId.has(entry.id)) throw new Error(`Duplicate entry id: ${entry.id}`);
    const existing = this.byIdempotencyKey.get(entry.idempotencyKey);
    if (existing) return existing;

    const frozen = Object.freeze({ ...entry });
    this.byId.set(entry.id, frozen);
    this.byIdempotencyKey.set(entry.idempotencyKey, frozen);
    return frozen;
  }

  async findEntryById(id: string): Promise<JournalEntry | undefined> {
    return this.byId.get(id);
  }

  async findEntryByIdempotencyKey(key: string): Promise<JournalEntry | undefined> {
    return this.byIdempotencyKey.get(key);
  }

  async findAllEntries(): Promise<readonly JournalEntry[]> {
    return Array.from(this.byId.values());
  }

  async saveReversal(originalEntryId: string, reversal: JournalEntry): Promise<void> {
    const original = this.byId.get(originalEntryId);
    if (!original) throw new Error(`ENTRY_NOT_FOUND:${originalEntryId}`);
    if (original.status !== "POSTED") throw new Error(`NOT_POSTED:${originalEntryId}`);
    if (original.reversedById !== undefined) {
      throw new Error(`ALREADY_REVERSED:${originalEntryId}`);
    }
    if (this.byId.has(reversal.id)) throw new Error(`Duplicate entry id: ${reversal.id}`);
    if (this.byIdempotencyKey.has(reversal.idempotencyKey)) {
      throw new Error(`Duplicate idempotency key: ${reversal.idempotencyKey}`);
    }

    const reversalFrozen = Object.freeze({ ...reversal });
    const originalUpdated = Object.freeze({ ...original, reversedById: reversal.id });

    // Both maps are updated synchronously; there is no observable half-commit.
    this.byId.set(originalEntryId, originalUpdated);
    this.byIdempotencyKey.set(original.idempotencyKey, originalUpdated);
    this.byId.set(reversal.id, reversalFrozen);
    this.byIdempotencyKey.set(reversal.idempotencyKey, reversalFrozen);
  }
}
