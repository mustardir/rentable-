export type DocumentFormat = 'DOCX' | 'PDF';

export type DocumentType =
  | 'INVESTOR_STATEMENT'
  | 'INVESTMENT_CONFIRMATION'
  | 'DEPOSIT_CONFIRMATION'
  | 'WITHDRAWAL_CONFIRMATION'
  | 'FX_CONFIRMATION'
  | 'CRYPTO_DEPOSIT_CONFIRMATION'
  | 'CRYPTO_WITHDRAWAL_CONFIRMATION'
  | 'COMPLIANCE_REPORT'
  | 'OTHER';

export interface DocumentRequest {
  readonly type: DocumentType;
  readonly format: DocumentFormat;
  readonly templateId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GeneratedDocument {
  readonly id: string;
  readonly type: DocumentType;
  readonly format: DocumentFormat;
  readonly templateId: string;
  readonly storageKey: string;
  readonly contentHash: string;
  readonly createdAt: Date;
}

export interface DocumentGenerator {
  generate(request: DocumentRequest): Promise<GeneratedDocument>;
}
