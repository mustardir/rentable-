CREATE TABLE "UserLedgerAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserLedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserLedgerAccount_userId_accountId_key" ON "UserLedgerAccount"("userId", "accountId");
CREATE INDEX "UserLedgerAccount_userId_isActive_idx" ON "UserLedgerAccount"("userId", "isActive");
CREATE INDEX "UserLedgerAccount_accountId_isActive_idx" ON "UserLedgerAccount"("accountId", "isActive");

ALTER TABLE "UserLedgerAccount" ADD CONSTRAINT "UserLedgerAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLedgerAccount" ADD CONSTRAINT "UserLedgerAccount_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
