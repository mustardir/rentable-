-- Fortress Fund ledger hardening.
-- Journal history is append-only. Posted financial facts cannot be edited or deleted.
-- Reversals remain the only permitted mutation of a JournalEntry header: the
-- original entry may be linked to exactly one reversing entry via reversedById.

CREATE OR REPLACE FUNCTION "fortress_guard_journal_entry_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- The only permitted update to a journal entry is setting reversedById
    -- exactly once. No financial/accounting field may be changed.
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
       OR NEW."reference" IS DISTINCT FROM OLD."reference"
       OR NEW."description" IS DISTINCT FROM OLD."description"
       OR NEW."currency" IS DISTINCT FROM OLD."currency"
       OR NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."postedAt" IS DISTINCT FROM OLD."postedAt"
       OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
       OR NEW."metadata" IS DISTINCT FROM OLD."metadata"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    THEN
        RAISE EXCEPTION 'JOURNAL_ENTRY_IMMUTABLE: posted journal entries cannot be modified';
    END IF;

    IF OLD."reversedById" IS NOT NULL
       OR NEW."reversedById" IS NULL
       OR NEW."reversedById" = OLD."reversedById"
    THEN
        RAISE EXCEPTION 'JOURNAL_ENTRY_IMMUTABLE: reversal link may only be set once';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "fortress_guard_journal_entry_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'JOURNAL_ENTRY_IMMUTABLE: journal entries cannot be deleted';
END;
$$;

CREATE OR REPLACE FUNCTION "fortress_guard_journal_line_write"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'JOURNAL_LINE_IMMUTABLE: journal lines cannot be modified';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'JOURNAL_LINE_IMMUTABLE: journal lines cannot be deleted';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS "JournalEntry_immutable_update" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_immutable_update"
BEFORE UPDATE ON "JournalEntry"
FOR EACH ROW
EXECUTE FUNCTION "fortress_guard_journal_entry_update"();

DROP TRIGGER IF EXISTS "JournalEntry_immutable_delete" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_immutable_delete"
BEFORE DELETE ON "JournalEntry"
FOR EACH ROW
EXECUTE FUNCTION "fortress_guard_journal_entry_delete"();

DROP TRIGGER IF EXISTS "JournalLine_immutable_update" ON "JournalLine";
CREATE TRIGGER "JournalLine_immutable_update"
BEFORE UPDATE ON "JournalLine"
FOR EACH ROW
EXECUTE FUNCTION "fortress_guard_journal_line_write"();

DROP TRIGGER IF EXISTS "JournalLine_immutable_delete" ON "JournalLine";
CREATE TRIGGER "JournalLine_immutable_delete"
BEFORE DELETE ON "JournalLine"
FOR EACH ROW
EXECUTE FUNCTION "fortress_guard_journal_line_write"();
