export type InvestmentSubscriptionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REDEEMED' | 'FAILED' | 'CANCELLED';

export interface CreateInvestmentSubscriptionInput {
  readonly userId: string;
  readonly productId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly reference?: string;
}

export interface InvestmentSubscription {
  readonly id: string;
  readonly userId: string;
  readonly productId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly status: InvestmentSubscriptionStatus;
  readonly idempotencyKey: string;
  readonly reference: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}