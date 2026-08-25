import { describe, expect, it } from 'vitest';
import { INVESTMENT_CONFIRMATION_TEMPLATE } from '../../../packages/document-core/src/templates/investment-confirmation';

describe('investment-confirmation template v1', () => {
  const data = {
    investorName: 'Jordan Example',
    confirmationReference: 'FF-INV-000001',
    productName: 'Fortress Growth Fund',
    productCode: 'FGF-001',
    currency: 'USD',
    amountMinor: 5000n,
    investmentDate: '2026-08-23',
    tenorDays: 365,
    maturityDate: '2027-08-23',
    generatedAt: '2026-08-23T10:00:00Z',
  };

  it('renders a production-shaped confirmation using synthetic data', () => {
    const rendered = INVESTMENT_CONFIRMATION_TEMPLATE.renderData(data);

    expect(rendered.title).toBe('Fortress Funds Investment Confirmation');
    expect(rendered.body).toContain('Investor: Jordan Example');
    expect(rendered.body).toContain('Confirmation reference: FF-INV-000001');
    expect(rendered.body).toContain('Currency: USD');
    expect(rendered.body).toContain('Investment amount (minor units): 5000');
    expect(rendered.body).toContain('Tenor: 365 days');
    expect(rendered.body).toContain('Maturity date: 2027-08-23');
  });

  it('rejects invalid monetary amounts', () => {
    expect(() => INVESTMENT_CONFIRMATION_TEMPLATE.renderData({ ...data, amountMinor: 0n })).toThrow('INVALID_INVESTMENT_AMOUNT');
  });

  it('rejects invalid tenor values', () => {
    expect(() => INVESTMENT_CONFIRMATION_TEMPLATE.renderData({ ...data, tenorDays: 0 })).toThrow('INVALID_TENOR_DAYS');
  });
});
