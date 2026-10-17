-- Allow one investor ledger mapping per account and currency.
-- Existing rows remain valid; the old unique constraint prevented USD/EUR/etc.
-- mappings from coexisting with the same chart-of-accounts account.
DROP INDEX IF EXISTS "UserLedgerAccount_userId_accountId_key";

CREATE UNIQUE INDEX "UserLedgerAccount_userId_accountId_currency_key"
  ON "UserLedgerAccount"("userId", "accountId", "currency");

DROP INDEX IF EXISTS "UserLedgerAccount_userId_isActive_idx";
CREATE INDEX "UserLedgerAccount_userId_currency_isActive_idx"
  ON "UserLedgerAccount"("userId", "currency", "isActive");

DROP INDEX IF EXISTS "UserLedgerAccount_accountId_isActive_idx";
CREATE INDEX "UserLedgerAccount_accountId_currency_isActive_idx"
  ON "UserLedgerAccount"("accountId", "currency", "isActive");
