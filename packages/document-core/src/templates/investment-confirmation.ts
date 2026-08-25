import type { DocumentTemplate } from '../templates';
import type { DocumentRequest } from '../types';

export interface InvestmentConfirmationTemplateData {
  readonly title: string;
  readonly confirmationReference: string;
  readonly productName: string;
  readonly productCode: string;
  readonly currency: string;
  readonly amountMinor: bigint;
  readonly confirmedAt: string;
}

/**
 * Synthetic-data-safe template contract for the first Fortress Funds document.
 * Financial integrations are intentionally outside this template.
 */
export const INVESTMENT_CONFIRMATION_TEMPLATE: DocumentTemplate<InvestmentConfirmationTemplateData> = {
  id: 'investment-confirmation',
  version: 1,
  type: 'INVESTMENT_CONFIRMATION',
  format: 'DOCX',
  description: 'Versioned investment confirmation document template.',
  renderData(data): DocumentRequest['data'] {
    if (!data.confirmationReference.trim()) throw new Error('INVALID_CONFIRMATION_REFERENCE');
    if (!data.productName.trim()) throw new Error('INVALID_PRODUCT_NAME');
    if (!data.productCode.trim()) throw new Error('INVALID_PRODUCT_CODE');
    if (!data.currency.trim()) throw new Error('INVALID_CURRENCY');
    if (data.amountMinor <= 0n) throw new Error('INVALID_INVESTMENT_AMOUNT');
    if (!data.confirmedAt.trim()) throw new Error('INVALID_CONFIRMED_AT');

    return {
      title: data.title,
      body: [
        `Confirmation reference: ${data.confirmationReference}`,
        `Product: ${data.productName} (${data.productCode})`,
        `Currency: ${data.currency}`,
        `Amount (minor units): ${data.amountMinor.toString()}`,
        `Confirmed at: ${data.confirmedAt}`,
      ].join('\n'),
    };
  },
};
