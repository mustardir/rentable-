CREATE TYPE "InvestmentSubscriptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "InvestmentSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "InvestmentSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestmentSubscription_idempotencyKey_key" ON "InvestmentSubscription"("idempotencyKey");
CREATE UNIQUE INDEX "InvestmentSubscription_reference_key" ON "InvestmentSubscription"("reference");
CREATE INDEX "InvestmentSubscription_userId_createdAt_idx" ON "InvestmentSubscription"("userId", "createdAt");
CREATE INDEX "InvestmentSubscription_productId_status_idx" ON "InvestmentSubscription"("productId", "status");
CREATE INDEX "InvestmentSubscription_status_createdAt_idx" ON "InvestmentSubscription"("status", "createdAt");

ALTER TABLE "InvestmentSubscription" ADD CONSTRAINT "InvestmentSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvestmentSubscription" ADD CONSTRAINT "InvestmentSubscription_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "FinancialProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
