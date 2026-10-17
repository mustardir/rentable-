import { InvestmentPortfolioService } from '../src/financial-products/investment-portfolio.service';

describe('InvestmentPortfolioService', () => {
  it('derives positions from posted product-obligation journal lines', async () => {
    const prisma = {
      journalLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            direction: 'CREDIT',
            amountKobo: 5000n,
            metadata: { investorId: 'user-1', subscriptionId: 'sub-1' },
          },
          {
            direction: 'CREDIT',
            amountKobo: 3000n,
            metadata: { investorId: 'user-1', subscriptionId: 'sub-2' },
          },
          {
            direction: 'DEBIT',
            amountKobo: 1000n,
            metadata: { investorId: 'user-1', subscriptionId: 'sub-1' },
          },
        ]),
      },
      investmentSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            userId: 'user-1',
            currency: 'USD',
            productId: 'product-1',
            product: { code: 'FORT-INVEST-001', name: 'Fortress Investment' },
          },
          {
            id: 'sub-2',
            userId: 'user-1',
            currency: 'USD',
            productId: 'product-1',
            product: { code: 'FORT-INVEST-001', name: 'Fortress Investment' },
          },
        ]),
      },
    };

    const service = new InvestmentPortfolioService(prisma as never);

    await expect(service.getMyPositions('user-1', 'usd')).resolves.toEqual([
      {
        subscriptionId: 'sub-1',
        productId: 'product-1',
        productCode: 'FORT-INVEST-001',
        productName: 'Fortress Investment',
        currency: 'USD',
        amountMinor: '4000',
      },
      {
        subscriptionId: 'sub-2',
        productId: 'product-1',
        productCode: 'FORT-INVEST-001',
        productName: 'Fortress Investment',
        currency: 'USD',
        amountMinor: '3000',
      },
    ]);
  });

  it('reduces a position when a posted redemption line debits the product obligation account', async () => {
    const prisma = {
      journalLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            direction: 'CREDIT',
            amountKobo: 5000n,
            metadata: { investorId: 'user-1', subscriptionId: 'sub-1' },
          },
          {
            direction: 'DEBIT',
            amountKobo: 5000n,
            metadata: { investorId: 'user-1', subscriptionId: 'sub-1' },
          },
        ]),
      },
      investmentSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            userId: 'user-1',
            currency: 'USD',
            product: { id: 'product-1', code: 'FORT-INVEST-001', name: 'Fortress Investment' },
          },
        ]),
      },
    };

    const service = new InvestmentPortfolioService(prisma as never);

    await expect(service.getMyPositions('user-1', 'USD')).resolves.toEqual([]);
  });

  it('rejects an invalid currency', async () => {
    const prisma = { journalLine: { findMany: jest.fn() } };
    const service = new InvestmentPortfolioService(prisma as never);

    await expect(service.getMyPositions('user-1', 'US')).rejects.toThrow('INVALID_CURRENCY');
    expect(prisma.journalLine.findMany).not.toHaveBeenCalled();
  });

  it('does not expose zeroed positions', async () => {
    const prisma = {
      journalLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            direction: 'CREDIT',
            amountKobo: 5000n,
            metadata: { investorId: 'user-1', subscriptionId: 'sub-1' },
          },
          {
            direction: 'DEBIT',
            amountKobo: 5000n,
            metadata: { investorId: 'user-1', subscriptionId: 'sub-1' },
          },
        ]),
      },
      investmentSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            userId: 'user-1',
            currency: 'USD',
            product: { id: 'product-1', code: 'FORT-INVEST-001', name: 'Fortress Investment' },
          },
        ]),
      },
    };

    const service = new InvestmentPortfolioService(prisma as never);

    await expect(service.getMyPositions('user-1', 'USD')).resolves.toEqual([]);
  });
});
