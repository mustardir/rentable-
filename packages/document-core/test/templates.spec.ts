import { describe, expect, it } from 'vitest';
import { DocxDocumentRenderer } from '../src/docx';
import { InMemoryDocumentTemplateRegistry } from '../src/templates';
import { assertDocxPackage, validateDocxPackage } from '../src/validation';

const template = {
  id: 'FORTRESS-TEST-DOC',
  version: 1,
  type: 'OTHER' as const,
  format: 'DOCX' as const,
  description: 'Non-financial document smoke-test template',
  renderData: (data: Record<string, unknown>) => data,
};

describe('document-core template infrastructure', () => {
  it('registers and resolves the newest template version', () => {
    const registry = new InMemoryDocumentTemplateRegistry();
    registry.register(template);
    registry.register({ ...template, version: 2 });

    expect(registry.get(template.id)?.version).toBe(2);
    expect(registry.get(template.id, 1)?.version).toBe(1);
    expect(registry.list('OTHER')).toHaveLength(2);
  });

  it('rejects duplicate template versions', () => {
    const registry = new InMemoryDocumentTemplateRegistry();
    registry.register(template);
    expect(() => registry.register(template)).toThrow('DUPLICATE_TEMPLATE_VERSION');
  });

  it('rejects non-DOCX templates in the DOCX registry', () => {
    const registry = new InMemoryDocumentTemplateRegistry();
    expect(() => registry.register({ ...template, format: 'PDF' })).toThrow('UNSUPPORTED_TEMPLATE_FORMAT');
  });
});

describe('DOCX validation', () => {
  it('generates deterministic, structurally valid DOCX bytes', async () => {
    const renderer = new DocxDocumentRenderer();
    const request = {
      type: 'OTHER' as const,
      format: 'DOCX' as const,
      templateId: template.id,
      data: { title: 'Fortress Fund Document Test', body: 'No financial data.' },
    };

    const first = await renderer.render(request);
    const second = await renderer.render(request);

    expect(first.bytes).toEqual(second.bytes);
    expect(validateDocxPackage(first.bytes)).toEqual({ valid: true, errors: [] });
    expect(() => assertDocxPackage(first.bytes)).not.toThrow();
    expect(first.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});
