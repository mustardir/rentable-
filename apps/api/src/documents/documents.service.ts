import type {
  DocumentRequest,
  GeneratedDocument,
} from '@fortress/document-core';

export class DocumentsService {
  async generate(_request: DocumentRequest): Promise<GeneratedDocument> {
    throw new Error('DOCUMENT_GENERATOR_NOT_CONFIGURED');
  }
}
