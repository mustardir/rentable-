/**
 * tests/account.test.ts
 *
 * Tests for the Chart of Accounts registry.
 */

import { describe, it, expect } from "vitest";
import {
  findAccountById,
  findAccountByCode,
  getAllAccounts,
  normalBalanceFor,
} from "../src/account.js";

describe("getAllAccounts", () => {
  it("returns 9 canonical accounts", () => {
    expect(getAllAccounts()).toHaveLength(9);
  });
});

describe("findAccountById", () => {
  it("finds Investor Cash by id", () => {
    const acct = findAccountById("acct_1100");
    expect(acct).toBeDefined();
    expect(acct?.name).toBe("Investor Cash");
    expect(acct?.type).toBe("ASSET");
    expect(acct?.normalBalance).toBe("DEBIT");
  });

  it("finds Customer Deposits by id", () => {
    const acct = findAccountById("acct_2100");
    expect(acct?.type).toBe("LIABILITY");
    expect(acct?.normalBalance).toBe("CREDIT");
  });

  it("returns undefined for unknown id", () => {
    expect(findAccountById("acct_9999")).toBeUndefined();
  });
});

describe("findAccountByCode", () => {
  it("finds Settlement Account by code", () => {
    const acct = findAccountByCode("1200");
    expect(acct?.id).toBe("acct_1200");
  });

  it("returns undefined for unknown code", () => {
    expect(findAccountByCode("9999")).toBeUndefined();
  });
});

describe("normalBalanceFor", () => {
  it("ASSET has DEBIT normal balance", () => {
    expect(normalBalanceFor("ASSET")).toBe("DEBIT");
  });

  it("LIABILITY has CREDIT normal balance", () => {
    expect(normalBalanceFor("LIABILITY")).toBe("CREDIT");
  });

  it("EQUITY has CREDIT normal balance", () => {
    expect(normalBalanceFor("EQUITY")).toBe("CREDIT");
  });

  it("REVENUE has CREDIT normal balance", () => {
    expect(normalBalanceFor("REVENUE")).toBe("CREDIT");
  });

  it("EXPENSE has DEBIT normal balance", () => {
    expect(normalBalanceFor("EXPENSE")).toBe("DEBIT");
  });
});
