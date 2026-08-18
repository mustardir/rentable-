-- Add core-banking ledger primitives while preserving integer-kobo accounting.

CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "Direction" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'INVESTMENT_PURCHASE', 'REDEMPTION', 'ADJUSTMENT');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED');
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED');

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "normalBalance" "Direction" NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "EntryStatus" NOT NULL DEFAULT 'POSTED',
    "postedAt" TIMESTAMP(3) NOT NULL,
    "reversalOfId" TEXT,
    "reversedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JournalLine_amountKobo_positive" CHECK ("amountKobo" > 0)
);

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amountKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Transaction_amountKobo_positive" CHECK ("amountKobo" > 0)
);

CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "sourceUserId" TEXT NOT NULL,
    "destinationUserId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "amountKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Transfer_amountKobo_positive" CHECK ("amountKobo" > 0),
    CONSTRAINT "Transfer_distinct_users" CHECK ("sourceUserId" <> "destinationUserId")
);

CREATE TABLE "WalletBalanceCache" (
    "investorId" TEXT NOT NULL,
    "availableKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "lastJournalLineId" TEXT NOT NULL,
    "rebuiltAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WalletBalanceCache_pkey" PRIMARY KEY ("investorId")
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");
CREATE INDEX "Account_type_idx" ON "Account"("type");

CREATE UNIQUE INDEX "JournalEntry_idempotencyKey_key" ON "JournalEntry"("idempotencyKey");
CREATE UNIQUE INDEX "JournalEntry_reference_key" ON "JournalEntry"("reference");
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");
CREATE INDEX "JournalEntry_postedAt_idx" ON "JournalEntry"("postedAt");
CREATE INDEX "JournalEntry_createdByUserId_idx" ON "JournalEntry"("createdByUserId");

CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX "JournalLine_createdAt_idx" ON "JournalLine"("createdAt");

CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");
CREATE INDEX "Transaction_userId_status_idx" ON "Transaction"("userId", "status");
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

CREATE UNIQUE INDEX "Transfer_reference_key" ON "Transfer"("reference");
CREATE UNIQUE INDEX "Transfer_idempotencyKey_key" ON "Transfer"("idempotencyKey");
CREATE INDEX "Transfer_sourceUserId_status_idx" ON "Transfer"("sourceUserId", "status");
CREATE INDEX "Transfer_destinationUserId_status_idx" ON "Transfer"("destinationUserId", "status");
CREATE INDEX "Transfer_createdAt_idx" ON "Transfer"("createdAt");

CREATE UNIQUE INDEX "AuditEvent_sequence_key" ON "AuditEvent"("sequence");
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_destinationUserId_fkey" FOREIGN KEY ("destinationUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
