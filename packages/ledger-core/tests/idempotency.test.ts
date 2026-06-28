/**
 * tests/idempotency.test.ts
 *
 * Acceptance tests:
 * - Concurrent calls with the same key produce exactly one entry
 * - Existing entry returned on duplicate key
 * - Failed operations do not persist
 */

import { describe, it, expect, beforeEach } from "vitest";
import { IdempotencyService, checkIdempotencyKey } from "../src/idempotency.js";
import { PostingEngine } from "../src/posting-engine.js";
import { InMemoryRepository } from "../src/repository.js";
import { ok, err } from "../src/money.js";
import type { JournalError } from "../src/journal-entry.js";

describe("IdempotencyService.withIdempotency", () => {
  let svc: IdempotencyService;
  let repo: InMemoryRepository;
  let engine: PostingEngine;

  beforeEach(() => {
    svc = new IdempotencyService();
    repo = new InMemoryRepository();
    engine = new PostingEngine();
  });

  it("executes operation once and returns result", async () => {
    let callCount = 0;

    const result = await svc.withIdempotency("key-once", repo, async () => {
      callCount++;
      const r = engine.buildEntry({
        idempotencyKey: "key-once",
        lines: [
          { accountId: "acct_1100", direction: "DEBIT", amountKobo: 1_000n },
          {
            accountId: "acct_2100",
            direction: "CREDIT",
            amountKobo: 1_000n,
          },
        ],
      });
      return r;
    });

    expect(result.ok).toBe(true);
    expect(callCount).toBe(1);
  });

  it("returns existing entry on second call (does not re-execute)", async () => {
    let callCount = 0;

    const op = async () => {
      callCount++;
      return engine.buildEntry({
        idempotencyKey: "key-dup",
        lines: [
          { accountId: "acct_1100", direction: "DEBIT", amountKobo: 5_000n },
          {
            accountId: "acct_2100",
            direction: "CREDIT",
            amountKobo: 5_000n,
          },
        ],
      });
    };

    const first = await svc.withIdempotency("key-dup", repo, op);
    const second = await svc.withIdempotency("key-dup", repo, op);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.id).toBe(first.value.id);
    }
    expect(callCount).toBe(1); // op called once
  });

  it("concurrent callers race: exactly one entry persisted", async () => {
    let callCount = 0;

    const op = async () => {
      callCount++;
      return engine.buildEntry({
        idempotencyKey: "race-key",
        lines: [
          { accountId: "acct_1100", direction: "DEBIT", amountKobo: 1_000n },
          {
            accountId: "acct_2100",
            direction: "CREDIT",
            amountKobo: 1_000n,
          },
        ],
      });
    };

    const results = await Promise.all([
      svc.withIdempotency("race-key", repo, op),
      svc.withIdempotency("race-key", repo, op),
      svc.withIdempotency("race-key", repo, op),
    ]);

    // All three should return ok
    expect(results.every((r) => r.ok)).toBe(true);

    // All three should return the same entry id
    const ids = new Set(results.map((r) => (r.ok ? r.value.id : null)));
    expect(ids.size).toBe(1);

    // Operation called exactly once
    expect(callCount).toBe(1);

    // Only one entry in the repository
    const all = await repo.findAllEntries();
    expect(all).toHaveLength(1);
  });

  it("does not persist on operation failure", async () => {
    const result = await svc.withIdempotency("fail-key", repo, async () => {
      const error: JournalError = {
        kind: "UNBALANCED_ENTRY",
        message: "test error",
      };
      return err(error);
    });

    expect(result.ok).toBe(false);
    const all = await repo.findAllEntries();
    expect(all).toHaveLength(0);
  });
});

describe("checkIdempotencyKey", () => {
  it("returns ok when key is unused", async () => {
    const repo = new InMemoryRepository();
    const result = await checkIdempotencyKey("unused-key", repo);
    expect(result.ok).toBe(true);
  });

  it("returns DUPLICATE_IDEMPOTENCY_KEY when key is used", async () => {
    const repo = new InMemoryRepository();
    const engine = new PostingEngine();
    await engine.post(
      {
        idempotencyKey: "used-key",
        lines: [
          { accountId: "acct_1100", direction: "DEBIT", amountKobo: 1_000n },
          { accountId: "acct_2100", direction: "CREDIT", amountKobo: 1_000n },
        ],
      },
      repo
    );

    const result = await checkIdempotencyKey("used-key", repo);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.kind).toBe("DUPLICATE_IDEMPOTENCY_KEY");
  });
});
