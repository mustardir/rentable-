/**
 * tests/repository.test.ts
 *
 * Tests for InMemoryRepository – append-only semantics and lookups.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "../src/repository.js";
import { PostingEngine } from "../src/posting-engine.js";

function buildEntry(engine: PostingEngine, key: string) {
  const r = engine.buildEntry({
    idempotencyKey: key,
    lines: [
      { accountId: "acct_1100", direction: "DEBIT", amountKobo: 1_000n },
      { accountId: "acct_2100", direction: "CREDIT", amountKobo: 1_000n },
    ],
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("InMemoryRepository", () => {
  let repo: InMemoryRepository;
  const engine = new PostingEngine();

  beforeEach(() => {
    repo = new InMemoryRepository();
  });

  it("saves and retrieves an entry by id", async () => {
    const entry = buildEntry(engine, "r-1");
    await repo.saveEntry(entry);
    const found = await repo.findEntryById(entry.id);
    expect(found?.id).toBe(entry.id);
  });

  it("saves and retrieves an entry by idempotency key", async () => {
    const entry = buildEntry(engine, "r-idem");
    await repo.saveEntry(entry);
    const found = await repo.findEntryByIdempotencyKey("r-idem");
    expect(found?.idempotencyKey).toBe("r-idem");
  });

  it("returns undefined for missing id", async () => {
    expect(await repo.findEntryById("none")).toBeUndefined();
  });

  it("returns undefined for missing idempotency key", async () => {
    expect(await repo.findEntryByIdempotencyKey("none")).toBeUndefined();
  });

  it("throws on duplicate id (append-only)", async () => {
    const entry = buildEntry(engine, "r-dup");
    await repo.saveEntry(entry);
    await expect(repo.saveEntry(entry)).rejects.toThrow();
  });

  it("findAllEntries returns all saved entries", async () => {
    const e1 = buildEntry(engine, "all-1");
    const e2 = buildEntry(engine, "all-2");
    await repo.saveEntry(e1);
    await repo.saveEntry(e2);
    const all = await repo.findAllEntries();
    expect(all).toHaveLength(2);
  });

  it("markReversed updates reversedById", async () => {
    const entry = buildEntry(engine, "r-mark");
    await repo.saveEntry(entry);
    await repo.markReversed(entry.id, "reversal-id-xyz");
    const found = await repo.findEntryById(entry.id);
    expect(found?.reversedById).toBe("reversal-id-xyz");
  });

  it("markReversed throws for unknown id", async () => {
    await expect(repo.markReversed("ghost", "rev-id")).rejects.toThrow();
  });
});
