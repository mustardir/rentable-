const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface DocxValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Performs dependency-free structural validation of the generated DOCX package.
 * This validates the OpenXML package markers and required parts, not Word's full
 * schema. It is intentionally safe to run before storage or financial-data wiring.
 */
export function validateDocxPackage(bytes: Uint8Array): DocxValidationResult {
  const errors: string[] = [];

  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    errors.push('INVALID_ZIP_SIGNATURE');
    return { valid: false, errors };
  }

  const text = new TextDecoder().decode(bytes);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels']) {
    if (!text.includes(part)) errors.push(`MISSING_DOCX_PART:${part}`);
  }

  if (!text.includes('wordprocessingml.document.main+xml')) {
    errors.push('MISSING_MAIN_DOCUMENT_CONTENT_TYPE');
  }

  return { valid: errors.length === 0, errors };
}

export function assertDocxPackage(bytes: Uint8Array): void {
  const result = validateDocxPackage(bytes);
  if (!result.valid) throw new Error(`INVALID_DOCX_PACKAGE:${result.errors.join(',')}`);
}

export { DOCX_MIME_TYPE };
