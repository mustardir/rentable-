import type { DocumentRequest } from './types';
import { createZip } from './zip';

export interface RenderedDocument {
  readonly format: 'DOCX';
  readonly mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface DocumentRenderer {
  render(request: DocumentRequest): Promise<RenderedDocument>;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function paragraph(text: string, style?: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${escapeXml(style)}"/></w:pPr>` : '';
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function documentXml(request: DocumentRequest): string {
  const data = request.data;
  const title = typeof data.title === 'string' ? data.title : request.templateId;
  const body = typeof data.body === 'string' ? data.body : '';
  const paragraphs = [paragraph(title, 'Title')];
  if (body) {
    paragraphs.push(...body.split(/\r?\n/).map((line) => paragraph(line)));
  }
  paragraphs.push(paragraph(`Document type: ${request.type}`));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join('')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function safeFileName(request: DocumentRequest): string {
  const value = `${request.templateId}-${request.type}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${value || 'fortress-document'}.docx`;
}

/**
 * Framework-agnostic DOCX renderer. It intentionally accepts only request data
 * supplied by the caller and performs no ledger, investor, or financial lookups.
 */
export class DocxDocumentRenderer implements DocumentRenderer {
  async render(request: DocumentRequest): Promise<RenderedDocument> {
    if (request.format !== 'DOCX') {
      throw new Error('UNSUPPORTED_DOCUMENT_FORMAT');
    }

    const encoder = new TextEncoder();
    const bytes = createZip([
      { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
      { name: 'word/document.xml', data: encoder.encode(documentXml(request)) },
      { name: 'word/_rels/document.xml.rels', data: encoder.encode(DOCUMENT_RELS) },
    ]);

    return {
      format: 'DOCX',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: safeFileName(request),
      bytes,
    };
  }
}
