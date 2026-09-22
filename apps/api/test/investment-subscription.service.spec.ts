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

describe('InvestmentSubscriptionService.fund', () => {
  function prismaMock() {
    const subscription = {
      id: 'subscription-1',
      userId: 'user-1',
      productId: 'product-1',
      amountMinor: 5000n,
      currency: 'USD',
      status: 'PENDING',
      idempotencyKey: 'key-fund-1',
      reference: 'INV-key-fund-1',
      product: { id: 'product-1', status: 'ACTIVE' },
    };
    const tx = {
      investmentSubscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
        update: jest.fn().mockResolvedValue({ ...subscription, status: 'COMPLETED', journalEntryId: 'journal-1', transactionId: 'tx-1' }),
      },
      journalLine: {
        findMany: jest.fn().mockResolvedValue([
          { direction: 'CREDIT', amountKobo: 10000n },
        ]),
      },
      transaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'tx-1',
          userId: 'user-1',
          type: 'INVESTMENT_PURCHASE',
          status: 'PROCESSING',
          amountKobo: 5000n,
          currency: 'USD',
          reference: 'INV-key-fund-1',
          idempotencyKey: 'INVEST-FUND-key-fund-1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    return { tx, prisma: { $transaction: jest.fn(async (callback: any) => callback(tx)) } };
  }

  it('rejects funding when available balance is insufficient', async () => {
    const { prisma, tx } = prismaMock();
    tx.journalLine.findMany.mockResolvedValue([{ direction: 'CREDIT', amountKobo: 4999n }]);

    const service = new InvestmentSubscriptionService(
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      {} as never,
    );

    await expect(service.fund('user-1', 'subscription-1'))
      .rejects.toThrow('INSUFFICIENT_AVAILABLE_BALANCE');
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('posts through the canonical PostingEngine and keeps the journal in the same transaction', async () => {
    const { prisma, tx } = prismaMock();
    const ledgerRepository = {
      saveEntry: jest.fn(async (entry: any) => entry),
    };

    const service = new InvestmentSubscriptionService(
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      ledgerRepository as never,
    );

    await expect(service.fund('user-1', 'subscription-1'))
      .resolves.toMatchObject({ status: 'COMPLETED', journalEntryId: expect.any(String), transactionId: 'tx-1' });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'INVESTMENT_PURCHASE',
        amountKobo: 5000n,
        currency: 'USD',
      }),
    }));
    expect(ledgerRepository.saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'INVEST-FUND-key-fund-1',
        currency: 'USD',
        status: 'POSTED',
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct_2100', direction: 'DEBIT', amountKobo: 5000n }),
          expect.objectContaining({ accountId: 'acct_2200', direction: 'CREDIT', amountKobo: 5000n }),
        ]),
      }),
      tx,
    );
    expect(tx.transaction.update).toHaveBeenCalled();
    expect(tx.investmentSubscription.update).toHaveBeenCalled();
  });
});


describe('InvestmentSubscriptionService.redeem', () => {
  it('posts the canonical redemption entry and credits investor cash', async () => {
    const subscription = {
      id: 'subscription-1',
      userId: 'user-1',
      productId: 'product-1',
      amountMinor: 5000n,
      currency: 'USD',
      status: 'COMPLETED',
      idempotencyKey: 'key-fund-1',
      reference: 'INV-key-fund-1',
      product: { id: 'product-1', status: 'ACTIVE' },
    };
    const tx = {
      investmentSubscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
      },
      journalLine: {
        findMany: jest.fn().mockResolvedValue([{ direction: 'CREDIT', amountKobo: 5000n }]),
      },
      transaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'redeem-tx-1', journalEntryId: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const ledgerRepository = { saveEntry: jest.fn(async (entry: any) => entry) };

    const service = new InvestmentSubscriptionService(
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      ledgerRepository as never,
    );

    await expect(service.redeem('user-1', 'subscription-1', 'redeem-key-1'))
      .resolves.toMatchObject({ id: 'subscription-1', status: 'COMPLETED' });

    expect(tx.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'REDEMPTION',
        amountKobo: 5000n,
        currency: 'USD',
      }),
    }));
    expect(ledgerRepository.saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'INVEST-REDEEM-redeem-key-1',
        currency: 'USD',
        status: 'POSTED',
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct_2200', direction: 'DEBIT', amountKobo: 5000n }),
          expect.objectContaining({ accountId: 'acct_2100', direction: 'CREDIT', amountKobo: 5000n }),
        ]),
      }),
      tx,
    );
    expect(tx.transaction.update).toHaveBeenCalled();
  });

  it('rejects redemption when the investor position is insufficient', async () => {
    const subscription = {
      id: 'subscription-1',
      userId: 'user-1',
      productId: 'product-1',
      amountMinor: 5000n,
      currency: 'USD',
      status: 'COMPLETED',
      product: { id: 'product-1', status: 'ACTIVE' },
    };
    const tx = {
      investmentSubscription: { findUnique: jest.fn().mockResolvedValue(subscription) },
      journalLine: { findMany: jest.fn().mockResolvedValue([{ direction: 'CREDIT', amountKobo: 4999n }]) },
      transaction: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const service = new InvestmentSubscriptionService(
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      {} as never,
    );

    await expect(service.redeem('user-1', 'subscription-1', 'redeem-key-2'))
      .rejects.toThrow('INSUFFICIENT_INVESTMENT_POSITION');
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
