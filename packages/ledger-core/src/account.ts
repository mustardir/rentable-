/**
 * account.ts
 *
 * Chart of Accounts types and the canonical Fortress Fund account registry.
 * Frozen at v1 – see docs/chart-of-accounts-v1.md.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";

export type Direction = "DEBIT" | "CREDIT";

export interface Account {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly normalBalance: Direction;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export type AccountErrorKind = "ACCOUNT_NOT_FOUND";

export interface AccountError {
  readonly kind: AccountErrorKind;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Canonical Chart of Accounts (v1)
// Registry of accounts known to this package (see docs/chart-of-accounts-v1.md).
// Note: PostingEngine does not currently enforce that journal lines reference only these ids.
// ---------------------------------------------------------------------------

const ACCOUNTS: readonly Account[] = [
  {
    id: "acct_1000",
    code: "1000",
    name: "Assets",
    type: "ASSET",
    normalBalance: "DEBIT",
    description: "Top-level asset category",
  },
  {
    id: "acct_1100",
    code: "1100",
    name: "Investor Cash",
    type: "ASSET",
    normalBalance: "DEBIT",
    description:
      "Cash held on behalf of investors; funded by inbound deposits",
  },
  {
    id: "acct_1200",
    code: "1200",
    name: "Settlement Account",
    type: "ASSET",
    normalBalance: "DEBIT",
    description:
      "Funds in transit during payment settlement (bank/processor float)",
  },
  {
    id: "acct_2000",
    code: "2000",
    name: "Liabilities",
    type: "LIABILITY",
    normalBalance: "CREDIT",
    description: "Top-level liability category",
  },
  {
    id: "acct_2100",
    code: "2100",
    name: "Customer Deposits",
    type: "LIABILITY",
    normalBalance: "CREDIT",
    description: "Investor cash balances held in custody",
  },
  {
    id: "acct_2200",
    code: "2200",
    name: "Product Obligations",
    type: "LIABILITY",
    normalBalance: "CREDIT",
    description: "Capital committed to active investment products",
  },
  {
    id: "acct_3000",
    code: "3000",
    name: "Equity",
    type: "EQUITY",
    normalBalance: "CREDIT",
    description: "Top-level equity category",
  },
  {
    id: "acct_4000",
    code: "4000",
    name: "Revenue",
    type: "REVENUE",
    normalBalance: "CREDIT",
    description: "Top-level revenue category",
  },
  {
    id: "acct_5000",
    code: "5000",
    name: "Expenses",
    type: "EXPENSE",
    normalBalance: "DEBIT",
    description: "Top-level expense category",
  },
];

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

const ACCOUNT_BY_ID = new Map<string, Account>(
  ACCOUNTS.map((a) => [a.id, a])
);
const ACCOUNT_BY_CODE = new Map<string, Account>(
  ACCOUNTS.map((a) => [a.code, a])
);

export function findAccountById(id: string): Account | undefined {
  return ACCOUNT_BY_ID.get(id);
}

export function findAccountByCode(code: string): Account | undefined {
  return ACCOUNT_BY_CODE.get(code);
}

export function getAllAccounts(): readonly Account[] {
  return ACCOUNTS;
}

/**
 * Returns the normal balance direction for the given account type,
 * following standard accounting convention.
 */
export function normalBalanceFor(type: AccountType): Direction {
  return type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT";
}
