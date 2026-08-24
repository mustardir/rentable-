import type {
  DocumentRequest,
  GeneratedDocument,
} from '../../../../packages/document-core/src';

export class DocumentsService {
  async generate(_request: DocumentRequest): Promise<GeneratedDocument> {
    throw new Error('DOCUMENT_GENERATOR_NOT_CONFIGURED');
  }
}
