-- Fortress Fund: enforce currency isolation at the journal boundary.
-- Every journal line must use the parent JournalEntry currency, and a reversal
-- must use the same currency as the entry it reverses.

ALTER TABLE "JournalLine"
  ADD COLUMN "currency" TEXT;

UPDATE "JournalLine" jl
SET "currency" = je."currency"
FROM "JournalEntry" je
WHERE je."id" = jl."journalEntryId";

ALTER TABLE "JournalLine"
  ALTER COLUMN "currency" SET NOT NULL;

CREATE INDEX "JournalLine_currency_createdAt_idx"
  ON "JournalLine"("currency", "createdAt");

CREATE OR REPLACE FUNCTION fortress_guard_journal_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_currency TEXT;
  reversal_currency TEXT;
BEGIN
  IF TG_TABLE_NAME = 'JournalLine' THEN
    SELECT je."currency"
      INTO parent_currency
      FROM "JournalEntry" je
     WHERE je."id" = NEW."journalEntryId";

    IF parent_currency IS NULL THEN
      RAISE EXCEPTION 'JOURNAL_CURRENCY_INVALID: journal entry does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF NEW."currency" <> parent_currency THEN
      RAISE EXCEPTION 'JOURNAL_CURRENCY_MISMATCH: journal line currency % does not match journal entry currency %',
        NEW."currency", parent_currency;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'JournalEntry' AND NEW."reversalOfId" IS NOT NULL THEN
    SELECT je."currency"
      INTO reversal_currency
      FROM "JournalEntry" je
     WHERE je."id" = NEW."reversalOfId";

    IF reversal_currency IS NULL THEN
      RAISE EXCEPTION 'JOURNAL_REVERSAL_INVALID: reversal target does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF NEW."currency" <> reversal_currency THEN
      RAISE EXCEPTION 'JOURNAL_REVERSAL_CURRENCY_MISMATCH: reversal currency % does not match original currency %',
        NEW."currency", reversal_currency;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "JournalLine_currency_guard" ON "JournalLine";
CREATE TRIGGER "JournalLine_currency_guard"
BEFORE INSERT ON "JournalLine"
FOR EACH ROW
EXECUTE FUNCTION fortress_guard_journal_currency();

DROP TRIGGER IF EXISTS "JournalEntry_reversal_currency_guard" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_reversal_currency_guard"
BEFORE INSERT ON "JournalEntry"
FOR EACH ROW
EXECUTE FUNCTION fortress_guard_journal_currency();
