import type { CreateFinancialProductInput } from './financial-product.types';

/**
 * Primary-market default for Fortress Fund's investment product.
 * Monetary values are stored in integer minor units (USD cents).
 */
export const DEFAULT_USD_INVESTMENT_MINIMUM_MINOR = 5_000n;

export const DEFAULT_USD_INVESTMENT_PRODUCT: CreateFinancialProductInput = {
  code: 'FORT-INVEST-001',
  name: 'Fortress Investment',
  type: 'INVESTMENT',
  currency: 'USD',
  minimumAmountMinor: DEFAULT_USD_INVESTMENT_MINIMUM_MINOR,
  status: 'ACTIVE',
  metadata: {},
};
