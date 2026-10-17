import type { DocumentTemplate } from '../templates';
import type { DocumentRequest } from '../types';

export interface InvestmentConfirmationTemplateData {
  readonly title?: string;
  readonly investorName: string;
  readonly confirmationReference: string;
  readonly productName: string;
  readonly productCode: string;
  readonly currency: string;
  /** Integer minor currency units; never a floating-point monetary value. */
  readonly amountMinor: bigint;
  readonly investmentDate: string;
  readonly tenorDays?: number | null;
  readonly maturityDate?: string | null;
  readonly generatedAt: string;
}

/**
 * Production-safe v1 investment confirmation template.
 *
 * The template only transforms caller-supplied document data. It deliberately
 * performs no investor, ledger, wallet, KYC, crypto, FX, or database lookups.
 */
export const INVESTMENT_CONFIRMATION_TEMPLATE: DocumentTemplate<InvestmentConfirmationTemplateData> = {
  id: 'investment-confirmation',
  version: 1,
  type: 'INVESTMENT_CONFIRMATION',
  format: 'DOCX',
  description: 'Fortress Funds investment confirmation, version 1.',
  renderData(data): DocumentRequest['data'] {
    if (!data.investorName.trim()) throw new Error('INVALID_INVESTOR_NAME');
    if (!data.confirmationReference.trim()) throw new Error('INVALID_CONFIRMATION_REFERENCE');
    if (!data.productName.trim()) throw new Error('INVALID_PRODUCT_NAME');
    if (!data.productCode.trim()) throw new Error('INVALID_PRODUCT_CODE');
    if (!data.currency.trim()) throw new Error('INVALID_CURRENCY');
    if (data.amountMinor <= 0n) throw new Error('INVALID_INVESTMENT_AMOUNT');
    if (!data.investmentDate.trim()) throw new Error('INVALID_INVESTMENT_DATE');
    if (!data.generatedAt.trim()) throw new Error('INVALID_GENERATED_AT');
    if (data.tenorDays !== undefined && data.tenorDays !== null && (!Number.isInteger(data.tenorDays) || data.tenorDays <= 0)) {
      throw new Error('INVALID_TENOR_DAYS');
    }
    if (data.maturityDate !== undefined && data.maturityDate !== null && !data.maturityDate.trim()) {
      throw new Error('INVALID_MATURITY_DATE');
    }

    const lines = [
      `Investor: ${data.investorName}`,
      `Confirmation reference: ${data.confirmationReference}`,
      `Investment product: ${data.productName} (${data.productCode})`,
      `Currency: ${data.currency}`,
      `Investment amount (minor units): ${data.amountMinor.toString()}`,
      `Investment date: ${data.investmentDate}`,
    ];

    if (data.tenorDays !== undefined && data.tenorDays !== null) {
      lines.push(`Tenor: ${data.tenorDays} days`);
    }
    if (data.maturityDate) {
      lines.push(`Maturity date: ${data.maturityDate}`);
    }

    lines.push(`Generated at: ${data.generatedAt}`);

    return {
      title: data.title?.trim() || 'Fortress Funds Investment Confirmation',
      body: lines.join('\n'),
    };
  },
};
