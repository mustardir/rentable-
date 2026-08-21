import { describe, it, expect } from "vitest";
import { PostingEngine } from "../src/posting-engine.js";
import { ReversalService } from "../src/reversal-service.js";
import { BalanceService } from "../src/balance-service.js";
import { InMemoryRepository } from "../src/repository.js";
import type { JournalEntry } from "../src/journal-entry.js";

async function postDeposit(engine: PostingEngine, repo: InMemoryRepository, key: string, amountKobo: bigint) {
  const result = await engine.post({ idempotencyKey: key, lines: [
    { accountId: "acct_1100", direction: "DEBIT", amountKobo },
    { accountId: "acct_2100", direction: "CREDIT", amountKobo, metadata: { investorId: "investor-1" } },
  ] }, repo);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("balance derivation and reversal invariants", () => {
  it("nets a posted entry and its posted reversal to zero", async () => {
    const engine = new PostingEngine(); const repo = new InMemoryRepository();
    const reversalService = new ReversalService(); const balanceService = new BalanceService();
    const original = await postDeposit(engine, repo, "balance-reversal-original", 125_000n);
    const reversal = await reversalService.reverse({ originalEntryId: original.id, idempotencyKey: "balance-reversal-command" }, repo);
    expect(reversal.ok).toBe(true);
    const entries = await repo.findAllEntries();
    expect(balanceService.getAccountBalance("acct_1100", entries)).toBe(0n);
    expect(balanceService.getAccountBalance("acct_2100", entries)).toBe(0n);
    expect(balanceService.getInvestorBalance("acct_2100", "investor-1", entries)).toBe(0n);
  });

  it("ignores a non-POSTED entry even when its lines contain reversal metadata", () => {
    const balanceService = new BalanceService();
    const pending: JournalEntry = {
      id: "pending-reversal", idempotencyKey: "pending-reversal-key", status: "PENDING", reversalOfId: "some-original",
      lines: [{ id: "pending-line", journalEntryId: "pending-reversal", accountId: "acct_1100", direction: "DEBIT", amountKobo: 900_000n as any, metadata: {}, createdAt: new Date() }],
      postedAt: new Date(), createdAt: new Date(),
    };
    expect(balanceService.getAccountBalance("acct_1100", [pending])).toBe(0n);
  });

  it("does not double-count a reversal in an investor balance", async () => {
    const engine = new PostingEngine(); const repo = new InMemoryRepository();
    const reversalService = new ReversalService(); const balanceService = new BalanceService();
    const original = await postDeposit(engine, repo, "investor-reversal-original", 80_000n);
    const result = await reversalService.reverse({ originalEntryId: original.id, idempotencyKey: "investor-reversal-command" }, repo);
    expect(result.ok).toBe(true);
    const entries = await repo.findAllEntries();
    expect(balanceService.getInvestorBalance("acct_2100", "investor-1", entries)).toBe(0n);
    expect(entries.filter((entry) => entry.reversalOfId === original.id)).toHaveLength(1);
  });

  it("leaves unrelated posted activity in the balance after a reversal", async () => {
    const engine = new PostingEngine(); const repo = new InMemoryRepository();
    const reversalService = new ReversalService(); const balanceService = new BalanceService();
    const original = await postDeposit(engine, repo, "reversal-with-unrelated", 40_000n);
    await postDeposit(engine, repo, "unrelated-posting", 15_000n);
    const result = await reversalService.reverse({ originalEntryId: original.id, idempotencyKey: "reversal-with-unrelated-command" }, repo);
    expect(result.ok).toBe(true);
    const entries = await repo.findAllEntries();
    expect(balanceService.getAccountBalance("acct_1100", entries)).toBe(15_000n);
    expect(balanceService.getInvestorBalance("acct_2100", "investor-1", entries)).toBe(15_000n);
  });
});
