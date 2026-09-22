import { describe, expect, it, vi } from 'vitest';
import { InvestmentPortfolioController } from '../src/financial-products/investment-portfolio.controller';

describe('InvestmentPortfolioController', () => {
  it('returns positions for the authenticated investor and requested currency', async () => {
    const positions = [
      {
        productId: 'product-1',
        productCode: 'FORT-INVEST-001',
        productName: 'Fortress Investment',
        currency: 'USD',
        amountMinor: '5000',
      },
    ];
    const service = {
      getMyPositions: vi.fn().mockResolvedValue(positions),
    };
    const controller = new InvestmentPortfolioController(service as never);

    await expect(
      controller.getMyPositions({ user: { id: 'user-1' } }, 'USD'),
    ).resolves.toEqual(positions);

    expect(service.getMyPositions).toHaveBeenCalledWith('user-1', 'USD');
  });

  it('passes an empty currency when the query parameter is omitted', async () => {
    const service = {
      getMyPositions: vi.fn().mockResolvedValue([]),
    };
    const controller = new InvestmentPortfolioController(service as never);

    await expect(
      controller.getMyPositions({ user: { id: 'user-1' } }),
    ).resolves.toEqual([]);

    expect(service.getMyPositions).toHaveBeenCalledWith('user-1', '');
  });
});
