export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AuditEventInput {
  actorUserId?: string | null;
  actorRole?: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: JsonValue;
  createdAt?: Date;
}

export interface AuditEvent {
  readonly id: string;
  readonly sequence: bigint;
  readonly actorUserId: string | null;
  readonly actorRole: string | null;
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: JsonValue;
  readonly previousHash: string | null;
  readonly hash: string;
  readonly createdAt: Date;
}

export interface AuditVerification {
  readonly valid: boolean;
  readonly reason?: string;
  readonly eventId?: string;
}
