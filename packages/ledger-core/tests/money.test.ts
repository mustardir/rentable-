/**
 * tests/money.test.ts
 *
 * Acceptance tests for integer money semantics.
 * Float inputs must be rejected; valid integer kobo values accepted.
 */

import { describe, it, expect } from "vitest";
import {
  koboFromBigInt,
  koboFromNumber,
  addKobo,
  isValidKobo,
} from "../src/money.js";

describe("koboFromNumber", () => {
  it("rejects float inputs", () => {
    const result = koboFromNumber(100.5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("FLOAT_INPUT");
  });

  it("rejects zero", () => {
    const result = koboFromNumber(0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("ZERO_AMOUNT");
  });

  it("rejects negative integers", () => {
    const result = koboFromNumber(-500);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("NEGATIVE_AMOUNT");
  });

  it("accepts valid positive integer", () => {
    const result = koboFromNumber(100_000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(100_000n);
  });

  it("rejects NaN", () => {
    const result = koboFromNumber(NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("FLOAT_INPUT");
  });

  it("rejects Infinity", () => {
    const result = koboFromNumber(Infinity);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("FLOAT_INPUT");
  });

  it("rejects -Infinity", () => {
    const result = koboFromNumber(-Infinity);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("FLOAT_INPUT");
  });
});

describe("koboFromBigInt", () => {
  it("accepts positive bigint", () => {
    const result = koboFromBigInt(50_000n);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(50_000n);
  });

  it("rejects zero bigint", () => {
    const result = koboFromBigInt(0n);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("ZERO_AMOUNT");
  });

  it("rejects negative bigint", () => {
    const result = koboFromBigInt(-1n);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("NEGATIVE_AMOUNT");
  });
});

describe("addKobo", () => {
  it("adds two kobo amounts correctly", () => {
    const a = koboFromBigInt(100_000n);
    const b = koboFromBigInt(50_000n);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(addKobo(a.value, b.value)).toBe(150_000n);
    }
  });
});

describe("isValidKobo", () => {
  it("returns true for positive bigint", () => {
    expect(isValidKobo(1n)).toBe(true);
  });

  it("returns false for zero", () => {
    expect(isValidKobo(0n)).toBe(false);
  });

  it("returns false for negative", () => {
    expect(isValidKobo(-1n)).toBe(false);
  });
});
