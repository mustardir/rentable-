CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "ProductType" AS ENUM ('SAVINGS', 'INVESTMENT', 'FIXED_INCOME', 'OTHER');

CREATE TABLE "FinancialProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL,
    "minimumAmountMinor" BIGINT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialProduct_code_key" ON "FinancialProduct"("code");
CREATE INDEX "FinancialProduct_status_createdAt_idx" ON "FinancialProduct"("status", "createdAt");
CREATE INDEX "FinancialProduct_currency_status_idx" ON "FinancialProduct"("currency", "status");

INSERT INTO "FinancialProduct" ("id", "code", "name", "type", "currency", "minimumAmountMinor", "status", "metadata", "updatedAt")
VALUES ('product_fort_invest_001', 'FORT-INVEST-001', 'Fortress Investment', 'INVESTMENT', 'USD', 5000, 'ACTIVE', '{"source":"migration","version":1}', CURRENT_TIMESTAMP);
