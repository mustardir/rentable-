import { randomUUID } from "node:crypto";

import { computeAuditHash } from "./hash";
import type { AuditEvent, AuditEventInput, AuditVerification } from "./types";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeEvent(event: AuditEvent): AuditEvent {
  Object.freeze(event.payload);
  return Object.freeze(event);
}

export class AuditStore {
  private readonly events: AuditEvent[] = [];
  private sequence = 0n;
  private readonly lastHashByEntity = new Map<string, string>();

  async append(input: AuditEventInput): Promise<AuditEvent> {
    if (!input.eventType || !input.entityType || !input.entityId) {
      throw new Error("INVALID_AUDIT_EVENT");
    }

    const sequence = this.sequence + 1n;
    const entityKey = `${input.entityType}:${input.entityId}`;
    const previousHash = this.lastHashByEntity.get(entityKey) ?? null;
    const event: AuditEvent = {
      id: randomUUID(),
      sequence,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: cloneJson(input.payload),
      previousHash,
      hash: "",
      createdAt: new Date(input.createdAt?.getTime() ?? Date.now()),
    };

    event.hash = computeAuditHash(event);
    const frozen = freezeEvent(event);
    this.events.push(frozen);
    this.sequence = sequence;
    this.lastHashByEntity.set(entityKey, frozen.hash);

    return frozen;
  }

  all(): readonly AuditEvent[] {
    return this.events.map((event) => ({
      ...event,
      payload: cloneJson(event.payload),
      createdAt: new Date(event.createdAt.getTime()),
    }));
  }

  forEntity(entityType: string, entityId: string): readonly AuditEvent[] {
    return this.all().filter((event) => event.entityType === entityType && event.entityId === entityId);
  }

  verify(): AuditVerification {
    let previousGlobalSequence = 0n;
    const lastHashByEntity = new Map<string, string>();

    for (const event of this.events) {
      if (event.sequence !== previousGlobalSequence + 1n) {
        return { valid: false, reason: "SEQUENCE_GAP", eventId: event.id };
      }

      const entityKey = `${event.entityType}:${event.entityId}`;
      const expectedPreviousHash = lastHashByEntity.get(entityKey) ?? null;
      if (event.previousHash !== expectedPreviousHash) {
        return { valid: false, reason: "PREVIOUS_HASH_MISMATCH", eventId: event.id };
      }

      const expectedHash = computeAuditHash(event);
      if (event.hash !== expectedHash) {
        return { valid: false, reason: "HASH_MISMATCH", eventId: event.id };
      }

      previousGlobalSequence = event.sequence;
      lastHashByEntity.set(entityKey, event.hash);
    }

    return { valid: true };
  }
}
