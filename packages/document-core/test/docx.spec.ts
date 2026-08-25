import { describe, expect, it } from 'vitest';
import { DocxDocumentRenderer } from '../src/docx';
import type { DocumentRequest } from '../src/types';

const request: DocumentRequest = {
  type: 'OTHER',
  format: 'DOCX',
  templateId: 'fortress-smoke-test',
  data: {
    title: 'Fortress Funds Document Test',
    body: 'This document contains no investor or financial data.',
  },
};

describe('DocxDocumentRenderer', () => {
  it('renders a valid DOCX package without external data access', async () => {
    const renderer = new DocxDocumentRenderer();
    const document = await renderer.render(request);
    const bytes = new TextDecoder().decode(document.bytes);

    expect(document.format).toBe('DOCX');
    expect(document.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(document.fileName).toBe('fortress-smoke-test-OTHER.docx');
    expect(document.bytes.slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    expect(bytes).toContain('[Content_Types].xml');
    expect(bytes).toContain('word/document.xml');
    expect(bytes).toContain('Fortress Funds Document Test');
  });
});
