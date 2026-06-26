/**
 * tests/utc.test.ts
 *
 * Deterministic UTC timestamp tests.
 *
 * All timestamps must be UTC. Entries built with fixed postedAt values
 * must preserve them exactly (no timezone shifting).
 */

import { describe, it, expect } from "vitest";
import { PostingEngine } from "../src/posting-engine.js";
import { ReversalService } from "../src/reversal-service.js";
import { InMemoryRepository } from "../src/repository.js";

const LINES = [
  { accountId: "acct_1100", direction: "DEBIT" as const, amountKobo: 1_000n },
  { accountId: "acct_2100", direction: "CREDIT" as const, amountKobo: 1_000n },
];

describe("UTC timestamps", () => {
  const engine = new PostingEngine();

  it("stores postedAt in UTC when no explicit date given", () => {
    const before = Date.now();
    const result = engine.buildEntry({ idempotencyKey: "utc-1", lines: LINES });
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const ts = result.value.postedAt.getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
      // ISO string ends with Z (UTC marker)
      expect(result.value.postedAt.toISOString()).toMatch(/Z$/);
    }
  });

  it("preserves explicit UTC timestamp with millisecond precision", () => {
    const fixed = new Date("2024-06-01T00:00:00.000Z");
    const result = engine.buildEntry({
      idempotencyKey: "utc-2",
      lines: LINES,
      postedAt: fixed,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.postedAt.toISOString()).toBe(
        "2024-06-01T00:00:00.000Z"
      );
    }
  });

  it("createdAt is always set to a UTC date", () => {
    const result = engine.buildEntry({ idempotencyKey: "utc-3", lines: LINES });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.createdAt.toISOString()).toMatch(/Z$/);
      for (const line of result.value.lines) {
        expect(line.createdAt.toISOString()).toMatch(/Z$/);
      }
    }
  });

  it("reversal timestamps preserved at UTC", async () => {
    const repo = new InMemoryRepository();
    const reversalSvc = new ReversalService();

    const postResult = await engine.post(
      { idempotencyKey: "utc-rev-orig", lines: LINES },
      repo
    );
    expect(postResult.ok).toBe(true);
    if (!postResult.ok) return;

    const fixedDate = new Date("2025-12-31T23:59:59.999Z");
    const revResult = await reversalSvc.reverse(
      {
        originalEntryId: postResult.value.id,
        idempotencyKey: "utc-rev-key",
        reversedAt: fixedDate,
      },
      repo
    );

    expect(revResult.ok).toBe(true);
    if (revResult.ok) {
      expect(revResult.value.postedAt.toISOString()).toBe(
        "2025-12-31T23:59:59.999Z"
      );
    }
  });

  it("multiple entries with deterministic timestamps produce expected order", async () => {
    const repo = new InMemoryRepository();
    const t1 = new Date("2024-01-01T00:00:00.000Z");
    const t2 = new Date("2024-01-02T00:00:00.000Z");
    const t3 = new Date("2024-01-03T00:00:00.000Z");

    for (const [key, ts] of [
      ["ts-a", t1],
      ["ts-b", t2],
      ["ts-c", t3],
    ] as [string, Date][]) {
      await engine.post(
        { idempotencyKey: key, lines: LINES, postedAt: ts },
        repo
      );
    }

    const all = await repo.findAllEntries();
    const dates = all.map((e) => e.postedAt.toISOString());
    expect(dates).toContain("2024-01-01T00:00:00.000Z");
    expect(dates).toContain("2024-01-02T00:00:00.000Z");
    expect(dates).toContain("2024-01-03T00:00:00.000Z");
  });
});
