import { describe, expect, it } from 'vitest';
import { FinancialProductController } from '../src/financial-products/financial-product.controller';

describe('FinancialProductController', () => {
  const product = {
    id: 'product-1',
    code: 'FORT-INVEST-001',
    name: 'Fortress Investment',
    type: 'INVESTMENT' as const,
    description: null,
    currency: 'USD',
    minimumAmountMinor: 5_000n,
    status: 'ACTIVE' as const,
    metadata: {},
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
  };

  const service = {
    listActive: async () => [product],
    findById: async (id: string) => (id === product.id ? product : null),
  };

  it('serializes integer minor-unit money as strings at the HTTP boundary', async () => {
    const controller = new FinancialProductController(service as never);
    await expect(controller.listActive()).resolves.toEqual([
      { ...product, minimumAmountMinor: '5000' },
    ]);
  });

  it('returns a product by id', async () => {
    const controller = new FinancialProductController(service as never);
    await expect(controller.getById(product.id)).resolves.toEqual({
      ...product,
      minimumAmountMinor: '5000',
    });
  });
});
