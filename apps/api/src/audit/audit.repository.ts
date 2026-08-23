import type { AuditEvent, AuditEventInput } from '@fortress/audit-core';

export interface AuditRepository {
  append(input: AuditEventInput): Promise<AuditEvent>;
  all(): Promise<readonly AuditEvent[]>;
  forEntity(entityType: string, entityId: string): Promise<readonly AuditEvent[]>;
}
