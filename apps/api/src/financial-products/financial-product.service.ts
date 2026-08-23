import type { CreateFinancialProductInput, FinancialProduct } from './financial-product.types';
import type { FinancialProductRepository } from './financial-product.repository';

export class FinancialProductService {
  constructor(private readonly repository: FinancialProductRepository) {}

  async create(input: CreateFinancialProductInput): Promise<FinancialProduct> {
    if (!input.code.trim()) throw new Error('INVALID_PRODUCT_CODE');
    if (!input.name.trim()) throw new Error('INVALID_PRODUCT_NAME');
    if (input.minimumAmountKobo < 0n) throw new Error('INVALID_MINIMUM_AMOUNT');
    return this.repository.create(input);
  }

  findById(id: string): Promise<FinancialProduct | null> {
    return this.repository.findById(id);
  }

  findByCode(code: string): Promise<FinancialProduct | null> {
    return this.repository.findByCode(code);
  }

  listActive(): Promise<readonly FinancialProduct[]> {
    return this.repository.listActive();
  }
}
