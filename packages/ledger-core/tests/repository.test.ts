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
    expect((await repo.findEntryById(entry.id))?.id).toBe(entry.id);
  });

  it("saves and retrieves an entry by idempotency key", async () => {
    const entry = buildEntry(engine, "r-idem");
    await repo.saveEntry(entry);
    expect((await repo.findEntryByIdempotencyKey("r-idem"))?.idempotencyKey).toBe("r-idem");
  });

  it("returns undefined for missing id and idempotency key", async () => {
    expect(await repo.findEntryById("none")).toBeUndefined();
    expect(await repo.findEntryByIdempotencyKey("none")).toBeUndefined();
  });

  it("rejects duplicate id", async () => {
    const entry = buildEntry(engine, "r-dup");
    await repo.saveEntry(entry);
    await expect(repo.saveEntry(entry)).rejects.toThrow();
  });

  it("findAllEntries returns all saved entries", async () => {
    await repo.saveEntry(buildEntry(engine, "all-1"));
    await repo.saveEntry(buildEntry(engine, "all-2"));
    expect(await repo.findAllEntries()).toHaveLength(2);
  });

  it("persists a reversal atomically and keeps the original POSTED", async () => {
    const original = buildEntry(engine, "r-original");
    const reversal = {
      ...original,
      id: "reversal-id-xyz",
      idempotencyKey: "r-reversal",
      reversalOfId: original.id,
    };
    await repo.saveEntry(original);
    await repo.saveReversal(original.id, reversal);
    const found = await repo.findEntryById(original.id);
    expect(found?.status).toBe("POSTED");
    expect(found?.reversedById).toBe(reversal.id);
    expect(await repo.findEntryById(reversal.id)).toBeDefined();
  });

  it("rejects reversing an unknown entry", async () => {
    const reversal = buildEntry(engine, "ghost-reversal");
    await expect(repo.saveReversal("ghost", reversal)).rejects.toThrow("ENTRY_NOT_FOUND:ghost");
  });

  it("rejects a second reversal", async () => {
    const original = buildEntry(engine, "double-original");
    const first = {
      ...original,
      id: "reversal-1",
      idempotencyKey: "double-reversal-1",
      reversalOfId: original.id,
    };
    const second = {
      ...original,
      id: "reversal-2",
      idempotencyKey: "double-reversal-2",
      reversalOfId: original.id,
    };
    await repo.saveEntry(original);
    await repo.saveReversal(original.id, first);
    await expect(repo.saveReversal(original.id, second)).rejects.toThrow("ALREADY_REVERSED:double-original");
  });
});
