export type FinancialProductStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export type FinancialProductType = 'SAVINGS' | 'INVESTMENT' | 'FIXED_INCOME' | 'OTHER';

export interface FinancialProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: FinancialProductType;
  readonly description: string | null;
  readonly currency: string;
  /** Minimum subscription amount in integer kobo. */
  readonly minimumAmountKobo: bigint;
  readonly status: FinancialProductStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateFinancialProductInput {
  readonly code: string;
  readonly name: string;
  readonly type: FinancialProductType;
  readonly description?: string | null;
  readonly currency?: string;
  readonly minimumAmountKobo: bigint;
  readonly status?: FinancialProductStatus;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
