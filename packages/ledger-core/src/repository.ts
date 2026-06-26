/**
 * repository.ts
 *
 * Pure-TypeScript repository interface and an in-memory implementation.
 *
 * No Prisma, Redis, or any external infrastructure dependency.
 * The in-memory implementation is used for tests and as a reference.
 * Production implementations must satisfy the same interface.
 */

import type { JournalEntry } from "./journal-entry.js";

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface Repository {
  /**
   * Persists a new journal entry (append-only – no updates).
   * Throws if an entry with the same id already exists.
   */
  saveEntry(entry: JournalEntry): Promise<void>;

  /**
   * Finds an entry by its primary id.
   */
  findEntryById(id: string): Promise<JournalEntry | undefined>;

  /**
   * Finds an entry by its idempotency key.
   */
  findEntryByIdempotencyKey(key: string): Promise<JournalEntry | undefined>;

  /**
   * Returns all posted entries in insertion order.
   */
  findAllEntries(): Promise<readonly JournalEntry[]>;

  /**
   * Atomically updates the reversedById field of an existing entry.
   * This is the only permitted mutation; all other fields are immutable.
   */
  markReversed(entryId: string, reversedById: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

export class InMemoryRepository implements Repository {
  // Stored as Object.freeze snapshots to prevent accidental mutation
  private readonly byId = new Map<string, JournalEntry>();
  private readonly byIdempotencyKey = new Map<string, JournalEntry>();

  async saveEntry(entry: JournalEntry): Promise<void> {
    if (this.byId.has(entry.id)) {
      throw new Error(`Duplicate entry id: ${entry.id}`);
    }
    const frozen = Object.freeze({ ...entry });
    this.byId.set(entry.id, frozen);
    this.byIdempotencyKey.set(entry.idempotencyKey, frozen);
  }

  async findEntryById(id: string): Promise<JournalEntry | undefined> {
    return this.byId.get(id);
  }

  async findEntryByIdempotencyKey(
    key: string
  ): Promise<JournalEntry | undefined> {
    return this.byIdempotencyKey.get(key);
  }

  async findAllEntries(): Promise<readonly JournalEntry[]> {
    return Array.from(this.byId.values());
  }

  async markReversed(entryId: string, reversedById: string): Promise<void> {
    const entry = this.byId.get(entryId);
    if (!entry) {
      throw new Error(`Entry not found: ${entryId}`);
    }
    const updated = Object.freeze({ ...entry, reversedById });
    this.byId.set(entryId, updated);
    this.byIdempotencyKey.set(entry.idempotencyKey, updated);
  }
}
