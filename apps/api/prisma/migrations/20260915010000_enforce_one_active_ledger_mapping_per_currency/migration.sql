-- Prevent an investor from having more than one active ledger mapping
-- for the same currency while allowing historical/inactive mappings.
CREATE UNIQUE INDEX "UserLedgerAccount_userId_currency_active_key"
  ON "UserLedgerAccount"("userId", "currency")
  WHERE "isActive" = true;
