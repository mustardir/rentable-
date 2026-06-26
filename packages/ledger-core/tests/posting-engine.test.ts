/**
 * tests/posting-engine.test.ts
 *
 * Acceptance tests for PostingEngine:
 * - Float inputs are rejected
 * - Balanced postings succeed
 * - Unbalanced postings fail
 * - Zero/negative amounts are rejected
 * - Idempotency: same key returns existing entry
 * - UTC timestamps are used
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PostingEngine } from "../src/posting-engine.js";
import { InMemoryRepository } from "../src/repository.js";

describe("PostingEngine.buildEntry", () => {
  const engine = new PostingEngine();

  it("accepts a balanced two-line entry", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-1",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100_000n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 100_000n },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("POSTED");
      expect(result.value.lines).toHaveLength(2);
    }
  });

  it("accepts a balanced four-line entry", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-4line",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 60_000n },
        { accountId: "acct_1200", direction: "DEBIT", amountKobo: 40_000n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 50_000n },
        { accountId: "acct_2200", direction: "CREDIT", amountKobo: 50_000n },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unbalanced entry (debits ≠ credits)", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-unbalanced",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100_000n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 99_000n },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("UNBALANCED_ENTRY");
  });

  it("rejects entry with only debits", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-only-debits",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100_000n },
        { accountId: "acct_1200", direction: "DEBIT", amountKobo: 100_000n },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("UNBALANCED_ENTRY");
  });

  it("rejects empty lines", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-empty",
      lines: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("EMPTY_LINES");
  });

  it("rejects single line (no debit+credit pair)", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-single",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100_000n },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("EMPTY_LINES");
  });

  it("rejects float amountKobo (number)", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-float",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100.5 },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 100.5 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("FLOAT_INPUT");
  });

  it("rejects zero amountKobo", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-zero",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 0n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 0n },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("ZERO_AMOUNT");
  });

  it("rejects negative amountKobo", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-neg",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: -100n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: -100n },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("NEGATIVE_AMOUNT");
  });

  it("rejects negative number amountKobo (number type)", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-neg-num",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: -1 },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: -1 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("NEGATIVE_AMOUNT");
  });

  it("rejects zero number amountKobo (number type)", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-zero-num",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 0 },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 0 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("ZERO_AMOUNT");
  });

  it("accepts integer number amountKobo", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-number",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 200_000 },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 200_000 },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("entry has UTC postedAt timestamp", () => {
    const before = new Date();
    const result = engine.buildEntry({
      idempotencyKey: "test-utc",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 1_000n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 1_000n },
      ],
    });
    const after = new Date();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.postedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(result.value.postedAt.getTime()).toBeLessThanOrEqual(
        after.getTime()
      );
    }
  });

  it("respects caller-supplied postedAt", () => {
    const fixedDate = new Date("2024-01-15T10:30:00.000Z");
    const result = engine.buildEntry({
      idempotencyKey: "test-fixed-date",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 1_000n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 1_000n },
      ],
      postedAt: fixedDate,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.postedAt.toISOString()).toBe(
        "2024-01-15T10:30:00.000Z"
      );
    }
  });

  it("attaches metadata to lines", () => {
    const result = engine.buildEntry({
      idempotencyKey: "test-meta",
      lines: [
        {
          accountId: "acct_2100",
          direction: "CREDIT",
          amountKobo: 500_000n,
          metadata: { investorId: "user_abc" },
        },
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 500_000n },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const line = result.value.lines.find(
        (l) => l.accountId === "acct_2100"
      );
      expect(line?.metadata["investorId"]).toBe("user_abc");
    }
  });
});

describe("PostingEngine.post (with repository)", () => {
  let engine: PostingEngine;
  let repo: InMemoryRepository;

  beforeEach(() => {
    engine = new PostingEngine();
    repo = new InMemoryRepository();
  });

  it("persists a balanced entry", async () => {
    const result = await engine.post(
      {
        idempotencyKey: "persist-1",
        lines: [
          { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100_000n },
          {
            accountId: "acct_2100",
            direction: "CREDIT",
            amountKobo: 100_000n,
          },
        ],
      },
      repo
    );
    expect(result.ok).toBe(true);

    const all = await repo.findAllEntries();
    expect(all).toHaveLength(1);
  });

  it("returns existing entry on duplicate idempotency key", async () => {
    const cmd = {
      idempotencyKey: "idem-key-1",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT" as const, amountKobo: 1_000n },
        { accountId: "acct_2100", direction: "CREDIT" as const, amountKobo: 1_000n },
      ],
    };

    const first = await engine.post(cmd, repo);
    const second = await engine.post(cmd, repo);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.id).toBe(first.value.id);
    }

    const all = await repo.findAllEntries();
    expect(all).toHaveLength(1);
  });

  it("does not persist invalid entries", async () => {
    await engine.post(
      {
        idempotencyKey: "bad-post",
        lines: [
          {
            accountId: "acct_1100",
            direction: "DEBIT",
            amountKobo: 100_000n,
          },
          {
            accountId: "acct_2100",
            direction: "CREDIT",
            amountKobo: 50_000n,
          },
        ],
      },
      repo
    );

    const all = await repo.findAllEntries();
    expect(all).toHaveLength(0);
  });
});
