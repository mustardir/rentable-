/**
 * Reversal acceptance tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PostingEngine } from "../src/posting-engine.js";
import { ReversalService } from "../src/reversal-service.js";
import { BalanceService } from "../src/balance-service.js";
import { InMemoryRepository } from "../src/repository.js";

async function postDeposit(engine: PostingEngine, repo: InMemoryRepository, key: string, amountKobo: bigint) {
  const r = await engine.post({
    idempotencyKey: key,
    lines: [
      { accountId: "acct_1100", direction: "DEBIT", amountKobo },
      { accountId: "acct_2100", direction: "CREDIT", amountKobo },
    ],
  }, repo);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("ReversalService.reverse", () => {
  let engine: PostingEngine;
  let repo: InMemoryRepository;
  let reversalSvc: ReversalService;
  let balanceSvc: BalanceService;

  beforeEach(() => {
    engine = new PostingEngine();
    repo = new InMemoryRepository();
    reversalSvc = new ReversalService();
    balanceSvc = new BalanceService();
  });

  it("reversal nets balance to zero", async () => {
    const original = await postDeposit(engine, repo, "rev-orig", 100_000n);
    const reversal = await reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "rev-reversal" }, repo);
    expect(reversal.ok).toBe(true);
    const entries = await repo.findAllEntries();
    expect(balanceSvc.getAccountBalance("acct_1100", entries)).toBe(0n);
    expect(balanceSvc.getAccountBalance("acct_2100", entries)).toBe(0n);
  });

  it("reversal entry has mirrored lines", async () => {
    const original = await postDeposit(engine, repo, "mirror-orig", 50_000n);
    const result = await reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "mirror-rev" }, repo);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reversalOfId).toBe(original.id);
      expect(result.value.status).toBe("POSTED");
      for (const origLine of original.lines) {
        const revLine = result.value.lines.find((l) => l.accountId === origLine.accountId);
        expect(revLine).toBeDefined();
        expect(revLine?.direction).not.toBe(origLine.direction);
        expect(revLine?.amountKobo).toBe(origLine.amountKobo);
      }
    }
  });

  it("keeps the original journal entry POSTED and only adds reversal metadata", async () => {
    const original = await postDeposit(engine, repo, "immutable-orig", 1_000n);
    const result = await reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "immutable-rev" }, repo);
    expect(result.ok).toBe(true);

    const updated = await repo.findEntryById(original.id);
    expect(updated?.status).toBe("POSTED");
    expect(updated?.reversedById).toBe(result.ok ? result.value.id : undefined);
    expect(updated?.lines).toEqual(original.lines);
  });

  it("rejects reversal of non-existent entry", async () => {
    const result = await reversalSvc.reverse({ originalEntryId: "does-not-exist", idempotencyKey: "no-entry-rev" }, repo);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("ENTRY_NOT_FOUND");
  });

  it("rejects reversal of a non-POSTED entry", async () => {
    const buildResult = engine.buildEntry({
      idempotencyKey: "non-posted-orig",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 1_000n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 1_000n },
      ],
    });
    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;
    const reversedEntry = { ...buildResult.value, status: "REVERSED" as const };
    await repo.saveEntry(reversedEntry);

    const result = await reversalSvc.reverse({ originalEntryId: reversedEntry.id, idempotencyKey: "rev-of-reversed" }, repo);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("NOT_POSTED");
  });

  it("rejects double-reversal", async () => {
    const original = await postDeposit(engine, repo, "double-orig", 1_000n);
    await reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "double-rev-1" }, repo);
    const second = await reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "double-rev-2" }, repo);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.kind).toBe("ALREADY_REVERSED");
  });

  it("allows only one concurrent reversal to win", async () => {
    const original = await postDeposit(engine, repo, "concurrent-orig", 2_000n);
    const [first, second] = await Promise.all([
      reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "concurrent-rev-1" }, repo),
      reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "concurrent-rev-2" }, repo),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const entries = await repo.findAllEntries();
    expect(entries).toHaveLength(2);
  });

  it("idempotency: same reversal key returns same entry", async () => {
    const original = await postDeposit(engine, repo, "idem-rev-orig", 1_000n);
    const first = await reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "idem-rev-key" }, repo);
    const second = await reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "idem-rev-key" }, repo);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.value.id).toBe(first.value.id);
  });

  it("reversal uses caller-supplied UTC timestamp", async () => {
    const original = await postDeposit(engine, repo, "ts-orig", 1_000n);
    const fixedDate = new Date("2025-03-10T08:00:00.000Z");
    const result = await reversalSvc.reverse({ originalEntryId: original.id, idempotencyKey: "ts-rev", reversedAt: fixedDate }, repo);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.postedAt.toISOString()).toBe("2025-03-10T08:00:00.000Z");
  });
});
