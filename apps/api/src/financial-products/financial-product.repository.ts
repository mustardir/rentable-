import type { CreateFinancialProductInput, FinancialProduct } from './financial-product.types';

export interface FinancialProductRepository {
  create(input: CreateFinancialProductInput): Promise<FinancialProduct>;
  findById(id: string): Promise<FinancialProduct | null>;
  findByCode(code: string): Promise<FinancialProduct | null>;
  listActive(): Promise<readonly FinancialProduct[]>;
}
