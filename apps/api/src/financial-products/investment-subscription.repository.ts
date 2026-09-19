import type { CreateInvestmentSubscriptionInput, InvestmentSubscription } from './investment-subscription.types';

export interface InvestmentSubscriptionRepository {
  create(input: CreateInvestmentSubscriptionInput): Promise<InvestmentSubscription>;
  findByIdempotencyKey(idempotencyKey: string): Promise<InvestmentSubscription | null>;
}