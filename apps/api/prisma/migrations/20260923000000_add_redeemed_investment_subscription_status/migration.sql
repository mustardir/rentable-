-- Add an explicit terminal lifecycle state for redeemed investment subscriptions.
ALTER TYPE "InvestmentSubscriptionStatus" ADD VALUE 'REDEEMED';
