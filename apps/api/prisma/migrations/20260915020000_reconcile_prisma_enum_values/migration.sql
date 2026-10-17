-- Reconcile the Prisma application enums with the enum types created by the
-- original banking/auth migrations. Existing persisted values are preserved.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PORTFOLIO_MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TREASURY_MANAGER';

ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'FEE';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'INVESTMENT';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'DIVESTMENT';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'EXCHANGE';
