-- Link every investment lifecycle transaction to its subscription without replacing the existing purchase pointers.

ALTER TABLE "Transaction"
ADD COLUMN "investmentSubscriptionId" TEXT;

CREATE INDEX "Transaction_investmentSubscriptionId_idx"
ON "Transaction"("investmentSubscriptionId");

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_investmentSubscriptionId_fkey"
FOREIGN KEY ("investmentSubscriptionId")
REFERENCES "InvestmentSubscription"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
