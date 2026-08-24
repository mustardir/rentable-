import { describe, expect, it } from 'vitest';
import { DEFAULT_USD_INVESTMENT_MINIMUM_MINOR } from '../src/financial-products/financial-product.defaults';

describe('financial product defaults', () => {
  it('sets the primary USD investment minimum to $50', () => {
    expect(DEFAULT_USD_INVESTMENT_MINIMUM_MINOR).toBe(5_000n);
  });
});
