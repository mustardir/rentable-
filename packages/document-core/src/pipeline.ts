import type { DocumentRenderer, RenderedDocument } from './docx';
import type { DocumentTemplateRegistry } from './templates';
import type { DocumentRequest, DocumentType } from './types';

export interface TemplateRenderInput {
  readonly templateId: string;
  readonly version?: number;
  readonly type: DocumentType;
  readonly data: Record<string, unknown>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Resolves a versioned template, transforms its input, and renders the result.
 * This layer contains no persistence or investor/ledger lookups.
 */
export class DocumentTemplatePipeline {
  constructor(
    private readonly registry: DocumentTemplateRegistry,
    private readonly renderer: DocumentRenderer,
  ) {}

  async render(input: TemplateRenderInput): Promise<RenderedDocument> {
    const template = this.registry.get(input.templateId, input.version);
    if (!template) throw new Error('DOCUMENT_TEMPLATE_NOT_FOUND');
    if (template.type !== input.type) throw new Error('DOCUMENT_TEMPLATE_TYPE_MISMATCH');

    const request: DocumentRequest = {
      type: template.type,
      format: template.format,
      templateId: template.id,
      data: template.renderData(input.data),
      metadata: input.metadata,
    };

    return this.renderer.render(request);
  }
}
