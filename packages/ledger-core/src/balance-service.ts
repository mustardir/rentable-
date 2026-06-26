/**
 * balance-service.ts
 *
 * Derives account balances from journal lines.
 *
 * Balances are NEVER stored as mutable columns.
 * Every balance is computed on-demand from POSTED JournalLine records,
 * following the SQL balance derivation rules in docs/chart-of-accounts-v1.md.
 *
 * Normal-balance convention:
 * - ASSET / EXPENSE: normal balance = DEBIT → balance = Σ(debits) - Σ(credits)
 * - LIABILITY / EQUITY / REVENUE: normal balance = CREDIT → balance = Σ(credits) - Σ(debits)
 */

import type { Account } from "./account.js";
import { findAccountById } from "./account.js";
import type { JournalEntry } from "./journal-entry.js";

// ---------------------------------------------------------------------------
// BalanceService
// ---------------------------------------------------------------------------

export class BalanceService {
  /**
   * Returns the net balance for an account (in kobo) across all POSTED entries.
   *
   * Positive result means the account has a balance on the normal side.
   * Negative result indicates a contra-balance.
   *
   * @param accountId  The id of the account (e.g. "acct_1100")
   * @param entries    All journal entries (only POSTED entries are counted)
   */
  getAccountBalance(
    accountId: string,
    entries: readonly JournalEntry[]
  ): bigint {
    let debits = 0n;
    let credits = 0n;

    for (const entry of entries) {
      if (entry.status !== "POSTED") continue;
      for (const line of entry.lines) {
        if (line.accountId !== accountId) continue;
        if (line.direction === "DEBIT") {
          debits += line.amountKobo;
        } else {
          credits += line.amountKobo;
        }
      }
    }

    const account: Account | undefined = findAccountById(accountId);
    if (!account) {
      // Unknown account: return raw debit − credit
      return debits - credits;
    }

    return account.normalBalance === "DEBIT"
      ? debits - credits
      : credits - debits;
  }

  /**
   * Returns the net balance for a specific investor on a given account.
   * Uses the `investorId` metadata tag on each JournalLine.
   *
   * @param accountId  e.g. "acct_2100" (Customer Deposits)
   * @param investorId The user/investor id to filter on
   * @param entries    All journal entries
   */
  getInvestorBalance(
    accountId: string,
    investorId: string,
    entries: readonly JournalEntry[]
  ): bigint {
    let debits = 0n;
    let credits = 0n;

    for (const entry of entries) {
      if (entry.status !== "POSTED") continue;
      for (const line of entry.lines) {
        if (line.accountId !== accountId) continue;
        if (line.metadata["investorId"] !== investorId) continue;
        if (line.direction === "DEBIT") {
          debits += line.amountKobo;
        } else {
          credits += line.amountKobo;
        }
      }
    }

    const account: Account | undefined = findAccountById(accountId);
    if (!account) {
      return debits - credits;
    }

    return account.normalBalance === "DEBIT"
      ? debits - credits
      : credits - debits;
  }

  /**
   * Returns a map of { accountId → balance } for all accounts that
   * appear in at least one posted line.
   */
  getAllBalances(
    entries: readonly JournalEntry[]
  ): ReadonlyMap<string, bigint> {
    const accountIds = new Set<string>();
    for (const entry of entries) {
      if (entry.status !== "POSTED") continue;
      for (const line of entry.lines) {
        accountIds.add(line.accountId);
      }
    }

    const result = new Map<string, bigint>();
    for (const id of accountIds) {
      result.set(id, this.getAccountBalance(id, entries));
    }
    return result;
  }
}
