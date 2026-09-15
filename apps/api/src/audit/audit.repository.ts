import type { AuditEvent, AuditEventInput } from '@fortress/audit-core';
import type { Prisma } from '@prisma/client';

export interface AuditRepository {
  append(input: AuditEventInput): Promise<AuditEvent>;
  appendInTransaction(tx: Prisma.TransactionClient, input: AuditEventInput): Promise<AuditEvent>;
  all(): Promise<readonly AuditEvent[]>;
  forEntity(entityType: string, entityId: string): Promise<readonly AuditEvent[]>;
}
