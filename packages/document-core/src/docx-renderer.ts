import type { DocumentRequest } from './types';
import { DocxDocumentRenderer, type RenderedDocument } from './docx';

/**
 * Production adapter boundary for DOCX rendering.
 *
 * The renderer is deliberately dependency-free and receives only a normalized
 * DocumentRequest. Financial systems must remain upstream of this boundary.
 */
export interface DocxRendererAdapter {
  render(request: DocumentRequest): Promise<RenderedDocument>;
}

export class FortressDocxRendererAdapter implements DocxRendererAdapter {
  constructor(private readonly renderer = new DocxDocumentRenderer()) {}

  render(request: DocumentRequest): Promise<RenderedDocument> {
    if (request.format !== 'DOCX') {
      throw new Error('UNSUPPORTED_DOCUMENT_FORMAT');
    }
    return this.renderer.render(request);
  }
}
