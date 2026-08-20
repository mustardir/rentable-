import { describe, expect, it } from "vitest";
import { PostingEngine } from "../src/posting-engine.js";
import { koboFromNumber } from "../src/money.js";

const engine = new PostingEngine();

describe("ledger monetary invariants", () => {
  it("accepts integer kobo and rejects zero, negative, and fractional amounts", () => {
    expect(koboFromNumber(100_000).ok).toBe(true);
    expect(koboFromNumber(0).ok).toBe(false);
    expect(koboFromNumber(-1).ok).toBe(false);
    expect(koboFromNumber(1.5).ok).toBe(false);
  });

  it("rejects an unbalanced journal entry", () => {
    const result = engine.buildEntry({
      idempotencyKey: "invariant-unbalanced",
      lines: [
        { accountId: "acct_1100", direction: "DEBIT", amountKobo: 10_000n },
        { accountId: "acct_2100", direction: "CREDIT", amountKobo: 9_999n },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("UNBALANCED_ENTRY");
  });

  it("rejects a single-line entry", () => {
    const result = engine.buildEntry({
      idempotencyKey: "invariant-single-line",
      lines: [{ accountId: "acct_1100", direction: "DEBIT", amountKobo: 10_000n }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("EMPTY_LINES");
  });
});
