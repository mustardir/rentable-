import { FinancialProductEligibilityService } from '../src/financial-products/financial-product-eligibility.service';

describe('FinancialProductEligibilityService', () => {
  it('returns KYC_NOT_APPROVED when the latest KYC is not approved', async () => {
    const products = {
      findById: jest.fn().mockResolvedValue({
        id: 'product-1',
        status: 'ACTIVE',
      }),
    };
    const prisma = {
      kYCRecord: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'PENDING',
          level: 'TIER_0',
        }),
      },
    };

    const service = new FinancialProductEligibilityService(prisma as never, products as never);
    await expect(service.check('user-1', 'product-1')).resolves.toMatchObject({
      eligible: false,
      reason: 'KYC_NOT_APPROVED',
      kycStatus: 'PENDING',
      kycLevel: 'TIER_0',
    });
  });

  it('returns ELIGIBLE only when the product is active and KYC is approved', async () => {
    const products = {
      findById: jest.fn().mockResolvedValue({
        id: 'product-1',
        status: 'ACTIVE',
      }),
    };
    const prisma = {
      kYCRecord: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'APPROVED',
          level: 'TIER_1',
        }),
      },
    };

    const service = new FinancialProductEligibilityService(prisma as never, products as never);
    await expect(service.check('user-1', 'product-1')).resolves.toMatchObject({
      eligible: true,
      reason: 'ELIGIBLE',
      kycStatus: 'APPROVED',
      kycLevel: 'TIER_1',
    });
  });
});
