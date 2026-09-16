-- Fortress Fund: require every financial record to declare its currency explicitly.
-- Existing rows are preserved; this removes legacy NGN database defaults only.

ALTER TABLE "UserLedgerAccount"
  ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "JournalLine"
  ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "Transaction"
  ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "Transfer"
  ALTER COLUMN "currency" DROP DEFAULT;
