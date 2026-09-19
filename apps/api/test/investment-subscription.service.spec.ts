import { InvestmentSubscriptionService } from '../src/financial-products/investment-subscription.service';

describe('InvestmentSubscriptionService', () => {
  const product = {
    id: 'product-1',
    currency: 'USD',
    minimumAmountMinor: 5000n,
  };

  it('rejects amounts below the product minimum', async () => {
    const service = new InvestmentSubscriptionService(
      { findById: jest.fn().mockResolvedValue(product) } as never,
      { check: jest.fn() } as never,
      { findByIdempotencyKey: jest.fn() } as never,
      {} as never,
    );

    await expect(service.create({
      userId: 'user-1',
      productId: 'product-1',
      amountMinor: '4999',
      currency: 'USD',
      idempotencyKey: 'key-1',
    })).rejects.toThrow('AMOUNT_BELOW_PRODUCT_MINIMUM');
  });

  it('creates a pending subscription only after eligibility passes', async () => {
    const repository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'subscription-1',
        userId: 'user-1',
        productId: 'product-1',
        amountMinor: 5000n,
        currency: 'USD',
        status: 'PENDING',
      }),
    };
    const eligibility = { check: jest.fn().mockResolvedValue({ eligible: true, reason: 'ELIGIBLE' }) };
    const service = new InvestmentSubscriptionService(
      { findById: jest.fn().mockResolvedValue(product) } as never,
      eligibility as never,
      repository as never,
      {} as never,
    );

    await expect(service.create({
      userId: 'user-1',
      productId: 'product-1',
      amountMinor: '5000',
      currency: 'USD',
      idempotencyKey: 'key-2',
    })).resolves.toMatchObject({ status: 'PENDING' });

    expect(repository.create).toHaveBeenCalled();
  });
});