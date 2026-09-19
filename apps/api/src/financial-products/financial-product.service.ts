import { Inject, Injectable } from '@nestjs/common';
import type { CreateFinancialProductInput, FinancialProduct } from './financial-product.types';
import type { FinancialProductRepository } from './financial-product.repository';

@Injectable()
export class FinancialProductService {
  constructor(
    @Inject('FinancialProductRepository')
    private readonly repository: FinancialProductRepository,
  ) {}

  async create(input: CreateFinancialProductInput): Promise<FinancialProduct> {
    if (!input.code.trim()) throw new Error('INVALID_PRODUCT_CODE');
    if (!input.name.trim()) throw new Error('INVALID_PRODUCT_NAME');
    if (!input.currency?.trim()) throw new Error('INVALID_CURRENCY');
    if (input.minimumAmountMinor < 0n) throw new Error('INVALID_MINIMUM_AMOUNT');
    return this.repository.create({
      ...input,
      currency: input.currency.trim().toUpperCase(),
    });
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
