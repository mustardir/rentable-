/**
 * tests/balance-service.test.ts
 *
 * Acceptance tests:
 * - Derived balances only (never stored)
 * - Normal-balance direction respected
 * - Per-investor balance filtering works
 * - PENDING entries excluded from balances
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PostingEngine } from "../src/posting-engine.js";
import { BalanceService } from "../src/balance-service.js";
import { InMemoryRepository } from "../src/repository.js";
import type { JournalEntry } from "../src/journal-entry.js";

async function postEntry(
  engine: PostingEngine,
  repo: InMemoryRepository,
  key: string,
  lines: Parameters<PostingEngine["buildEntry"]>[0]["lines"]
) {
  const r = await engine.post({ idempotencyKey: key, lines }, repo);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("BalanceService.getAccountBalance", () => {
  let engine: PostingEngine;
  let repo: InMemoryRepository;
  let svc: BalanceService;

  beforeEach(() => {
    engine = new PostingEngine();
    repo = new InMemoryRepository();
    svc = new BalanceService();
  });

  it("returns zero for empty entries", async () => {
    const entries = await repo.findAllEntries();
    expect(svc.getAccountBalance("acct_1100", entries)).toBe(0n);
  });

  it("returns correct balance after a deposit posting", async () => {
    // DR 1100 Investor Cash 100,000  /  CR 2100 Customer Deposits 100,000
    await postEntry(engine, repo, "dep-1", [
      { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100_000n },
      { accountId: "acct_2100", direction: "CREDIT", amountKobo: 100_000n },
    ]);

    const entries = await repo.findAllEntries();
    // acct_1100 is ASSET (normal=DEBIT): balance = debits - credits = 100,000
    expect(svc.getAccountBalance("acct_1100", entries)).toBe(100_000n);
    // acct_2100 is LIABILITY (normal=CREDIT): balance = credits - debits = 100,000
    expect(svc.getAccountBalance("acct_2100", entries)).toBe(100_000n);
  });

  it("accumulates across multiple postings", async () => {
    await postEntry(engine, repo, "dep-a", [
      { accountId: "acct_1100", direction: "DEBIT", amountKobo: 200_000n },
      { accountId: "acct_2100", direction: "CREDIT", amountKobo: 200_000n },
    ]);
    await postEntry(engine, repo, "dep-b", [
      { accountId: "acct_1100", direction: "DEBIT", amountKobo: 50_000n },
      { accountId: "acct_2100", direction: "CREDIT", amountKobo: 50_000n },
    ]);

    const entries = await repo.findAllEntries();
    expect(svc.getAccountBalance("acct_1100", entries)).toBe(250_000n);
    expect(svc.getAccountBalance("acct_2100", entries)).toBe(250_000n);
  });

  it("excludes PENDING entries from balance", async () => {
    // Build a PENDING-like entry manually (not persisted via engine)
    const pendingEntry: JournalEntry = {
      id: "fake-pending",
      idempotencyKey: "pending-key",
      status: "PENDING",
      lines: [
        {
          id: "line-1",
          journalEntryId: "fake-pending",
          accountId: "acct_1100",
          direction: "DEBIT",
          amountKobo: 999_000n as any,
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: "line-2",
          journalEntryId: "fake-pending",
          accountId: "acct_2100",
          direction: "CREDIT",
          amountKobo: 999_000n as any,
          metadata: {},
          createdAt: new Date(),
        },
      ],
      postedAt: new Date(),
      createdAt: new Date(),
    };

    const balance = svc.getAccountBalance("acct_1100", [pendingEntry]);
    expect(balance).toBe(0n);
  });

  it("returns correct balance for unknown account (raw debit-credit)", async () => {
    const entry: JournalEntry = {
      id: "fake-1",
      idempotencyKey: "uk-1",
      status: "POSTED",
      lines: [
        {
          id: "l1",
          journalEntryId: "fake-1",
          accountId: "acct_unknown",
          direction: "DEBIT",
          amountKobo: 1_000n as any,
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: "l2",
          journalEntryId: "fake-1",
          accountId: "acct_1100",
          direction: "CREDIT",
          amountKobo: 1_000n as any,
          metadata: {},
          createdAt: new Date(),
        },
      ],
      postedAt: new Date(),
      createdAt: new Date(),
    };
    const balance = svc.getAccountBalance("acct_unknown", [entry]);
    expect(balance).toBe(1_000n);
  });
});

describe("BalanceService.getInvestorBalance", () => {
  let engine: PostingEngine;
  let repo: InMemoryRepository;
  let svc: BalanceService;

  beforeEach(() => {
    engine = new PostingEngine();
    repo = new InMemoryRepository();
    svc = new BalanceService();
  });

  it("returns per-investor balance using metadata filter", async () => {
    // Investor A: 200,000 kobo
    await postEntry(engine, repo, "inv-a", [
      {
        accountId: "acct_1100",
        direction: "DEBIT",
        amountKobo: 200_000n,
      },
      {
        accountId: "acct_2100",
        direction: "CREDIT",
        amountKobo: 200_000n,
        metadata: { investorId: "user_A" },
      },
    ]);

    // Investor B: 500,000 kobo
    await postEntry(engine, repo, "inv-b", [
      {
        accountId: "acct_1100",
        direction: "DEBIT",
        amountKobo: 500_000n,
      },
      {
        accountId: "acct_2100",
        direction: "CREDIT",
        amountKobo: 500_000n,
        metadata: { investorId: "user_B" },
      },
    ]);

    const entries = await repo.findAllEntries();
    expect(svc.getInvestorBalance("acct_2100", "user_A", entries)).toBe(
      200_000n
    );
    expect(svc.getInvestorBalance("acct_2100", "user_B", entries)).toBe(
      500_000n
    );
  });

  it("returns zero for investor with no lines", async () => {
    const entries = await repo.findAllEntries();
    expect(svc.getInvestorBalance("acct_2100", "user_none", entries)).toBe(0n);
  });

  it("handles investor DEBIT lines on asset accounts", async () => {
    // Post a reversal-like entry where investor has DEBIT on acct_2100
    await postEntry(engine, repo, "inv-debit", [
      {
        accountId: "acct_2100",
        direction: "DEBIT",
        amountKobo: 100_000n,
        metadata: { investorId: "user_C" },
      },
      {
        accountId: "acct_1100",
        direction: "CREDIT",
        amountKobo: 100_000n,
      },
    ]);

    const entries = await repo.findAllEntries();
    // acct_2100 LIABILITY (normalBalance=CREDIT): credits - debits = 0 - 100,000 = -100,000
    expect(svc.getInvestorBalance("acct_2100", "user_C", entries)).toBe(
      -100_000n
    );
  });

  it("handles investor balance on ASSET account (normal=DEBIT)", async () => {
    // Post entry with investor tagged on acct_1100 (ASSET, normal=DEBIT)
    await postEntry(engine, repo, "inv-asset", [
      {
        accountId: "acct_1100",
        direction: "DEBIT",
        amountKobo: 75_000n,
        metadata: { investorId: "user_D" },
      },
      {
        accountId: "acct_2100",
        direction: "CREDIT",
        amountKobo: 75_000n,
      },
    ]);

    const entries = await repo.findAllEntries();
    // acct_1100 ASSET (normalBalance=DEBIT): debits - credits = 75,000
    expect(svc.getInvestorBalance("acct_1100", "user_D", entries)).toBe(
      75_000n
    );
  });

  it("handles unknown account in getInvestorBalance (returns raw debit-credit)", async () => {
    const entry: JournalEntry = {
      id: "fake-inv",
      idempotencyKey: "uk-inv-1",
      status: "POSTED",
      lines: [
        {
          id: "li1",
          journalEntryId: "fake-inv",
          accountId: "acct_unknown",
          direction: "DEBIT",
          amountKobo: 2_000n as any,
          metadata: { investorId: "user_X" },
          createdAt: new Date(),
        },
        {
          id: "li2",
          journalEntryId: "fake-inv",
          accountId: "acct_unknown",
          direction: "CREDIT",
          amountKobo: 500n as any,
          metadata: { investorId: "user_X" },
          createdAt: new Date(),
        },
      ],
      postedAt: new Date(),
      createdAt: new Date(),
    };
    expect(svc.getInvestorBalance("acct_unknown", "user_X", [entry])).toBe(
      1_500n
    );
  });
});

describe("BalanceService.getAllBalances", () => {
  it("returns map of all account balances", async () => {
    const engine = new PostingEngine();
    const repo = new InMemoryRepository();
    const svc = new BalanceService();

    await postEntry(engine, repo, "all-bal", [
      { accountId: "acct_1100", direction: "DEBIT", amountKobo: 100_000n },
      { accountId: "acct_2100", direction: "CREDIT", amountKobo: 100_000n },
    ]);

    const entries = await repo.findAllEntries();
    const balances = svc.getAllBalances(entries);

    expect(balances.get("acct_1100")).toBe(100_000n);
    expect(balances.get("acct_2100")).toBe(100_000n);
  });
});
