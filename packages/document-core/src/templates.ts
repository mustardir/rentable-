import type { DocumentFormat, DocumentRequest, DocumentType } from './types';

export interface DocumentTemplate<TData = Record<string, unknown>> {
  readonly id: string;
  readonly version: number;
  readonly type: DocumentType;
  readonly format: DocumentFormat;
  readonly description: string;
  renderData(data: TData): DocumentRequest['data'];
}

export interface DocumentTemplateRegistry {
  register(template: DocumentTemplate): void;
  get(id: string, version?: number): DocumentTemplate | null;
  list(type?: DocumentType): readonly DocumentTemplate[];
}

export class InMemoryDocumentTemplateRegistry implements DocumentTemplateRegistry {
  private readonly templates = new Map<string, DocumentTemplate>();

  register(template: DocumentTemplate): void {
    if (!template.id.trim()) throw new Error('INVALID_TEMPLATE_ID');
    if (!Number.isInteger(template.version) || template.version < 1) {
      throw new Error('INVALID_TEMPLATE_VERSION');
    }
    if (template.format !== 'DOCX') throw new Error('UNSUPPORTED_TEMPLATE_FORMAT');

    const key = `${template.id}@${template.version}`;
    if (this.templates.has(key)) throw new Error('DUPLICATE_TEMPLATE_VERSION');
    this.templates.set(key, template);
  }

  get(id: string, version?: number): DocumentTemplate | null {
    if (version !== undefined) return this.templates.get(`${id}@${version}`) ?? null;

    return [...this.templates.values()]
      .filter((template) => template.id === id)
      .sort((a, b) => b.version - a.version)[0] ?? null;
  }

  list(type?: DocumentType): readonly DocumentTemplate[] {
    const values = [...this.templates.values()];
    return type ? values.filter((template) => template.type === type) : values;
  }
}
