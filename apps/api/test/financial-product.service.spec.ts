import { FinancialProductService } from '../src/financial-products/financial-product.service';
import type {
  CreateFinancialProductInput,
  FinancialProduct,
} from '../src/financial-products/financial-product.types';
import type { FinancialProductRepository } from '../src/financial-products/financial-product.repository';

const product: FinancialProduct = {
  id: 'product-1',
  code: 'FORT-SAVE-001',
  name: 'Fortress Savings',
  type: 'SAVINGS',
  description: 'Test savings product',
  currency: 'NGN',
  minimumAmountKobo: 100_000n,
  status: 'ACTIVE',
  metadata: { rateBps: 1200 },
  createdAt: new Date('2026-08-21T00:00:00.000Z'),
  updatedAt: new Date('2026-08-21T00:00:00.000Z'),
};

class FakeFinancialProductRepository implements FinancialProductRepository {
  readonly created: CreateFinancialProductInput[] = [];

  async create(input: CreateFinancialProductInput): Promise<FinancialProduct> {
    this.created.push(input);
    return product;
  }

  async findById(id: string): Promise<FinancialProduct | null> {
    return id === product.id ? product : null;
  }

  async findByCode(code: string): Promise<FinancialProduct | null> {
    return code === product.code ? product : null;
  }

  async listActive(): Promise<readonly FinancialProduct[]> {
    return [product];
  }
}

describe('FinancialProductService', () => {
  it('creates a product and preserves integer kobo amounts', async () => {
    const repository = new FakeFinancialProductRepository();
    const service = new FinancialProductService(repository);
    const input: CreateFinancialProductInput = {
      code: product.code,
      name: product.name,
      type: product.type,
      minimumAmountKobo: 250_000n,
    };

    await expect(service.create(input)).resolves.toBe(product);
    expect(repository.created[0]?.minimumAmountKobo).toBe(250_000n);
  });

  it('rejects an empty product code', async () => {
    const service = new FinancialProductService(new FakeFinancialProductRepository());

    await expect(
      service.create({
        code: '   ',
        name: 'Fortress Savings',
        type: 'SAVINGS',
        minimumAmountKobo: 1n,
      }),
    ).rejects.toThrow('INVALID_PRODUCT_CODE');
  });

  it('rejects an empty product name', async () => {
    const service = new FinancialProductService(new FakeFinancialProductRepository());

    await expect(
      service.create({
        code: 'FORT-SAVE-001',
        name: '   ',
        type: 'SAVINGS',
        minimumAmountKobo: 1n,
      }),
    ).rejects.toThrow('INVALID_PRODUCT_NAME');
  });

  it('rejects a negative minimum amount', async () => {
    const service = new FinancialProductService(new FakeFinancialProductRepository());

    await expect(
      service.create({
        code: 'FORT-SAVE-001',
        name: 'Fortress Savings',
        type: 'SAVINGS',
        minimumAmountKobo: -1n,
      }),
    ).rejects.toThrow('INVALID_MINIMUM_AMOUNT');
  });

  it('delegates lookups and active listing to the repository', async () => {
    const repository = new FakeFinancialProductRepository();
    const service = new FinancialProductService(repository);

    await expect(service.findById(product.id)).resolves.toBe(product);
    await expect(service.findByCode(product.code)).resolves.toBe(product);
    await expect(service.listActive()).resolves.toEqual([product]);
  });
});
