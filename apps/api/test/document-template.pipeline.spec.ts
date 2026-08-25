import { describe, expect, it } from 'vitest';
import {
  DocxDocumentRenderer,
  DocumentTemplatePipeline,
  InMemoryDocumentTemplateRegistry,
  INVESTMENT_CONFIRMATION_TEMPLATE,
  validateDocxPackage,
} from '@fortress/document-core';

describe('DocumentTemplatePipeline', () => {
  it('renders the versioned investment confirmation template as valid DOCX', async () => {
    const registry = new InMemoryDocumentTemplateRegistry();
    registry.register(INVESTMENT_CONFIRMATION_TEMPLATE);

    const pipeline = new DocumentTemplatePipeline(registry, new DocxDocumentRenderer());
    const rendered = await pipeline.render({
      templateId: 'investment-confirmation',
      type: 'INVESTMENT_CONFIRMATION',
      data: {
        title: 'Fortress Funds Investment Confirmation',
        confirmationReference: 'TEST-0001',
        productName: 'Synthetic Investment Product',
        productCode: 'SYNTH-001',
        currency: 'USD',
        amountMinor: 5000n,
        confirmedAt: '2026-08-23T00:00:00.000Z',
      },
    });

    expect(rendered.format).toBe('DOCX');
    expect(rendered.fileName).toBe('investment-confirmation-INVESTMENT_CONFIRMATION.docx');
    expect(validateDocxPackage(rendered.bytes)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a request for an unknown template', async () => {
    const pipeline = new DocumentTemplatePipeline(
      new InMemoryDocumentTemplateRegistry(),
      new DocxDocumentRenderer(),
    );

    await expect(
      pipeline.render({
        templateId: 'missing-template',
        type: 'INVESTMENT_CONFIRMATION',
        data: {},
      }),
    ).rejects.toThrow('DOCUMENT_TEMPLATE_NOT_FOUND');
  });
});
