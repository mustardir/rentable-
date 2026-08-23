import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { computeAuditHash } from '@fortress/audit-core';
import type { AuditEvent, AuditEventInput, JsonValue } from '@fortress/audit-core';

import { PrismaService } from '../prisma/prisma.service';
import type { AuditRepository } from './audit.repository';

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AuditEventInput): Promise<AuditEvent> {
    if (!input.eventType || !input.entityType || !input.entityId) {
      throw new Error('INVALID_AUDIT_EVENT');
    }

    return this.prisma.$transaction(async (tx) => {
      const [{ sequence }] = await tx.$queryRaw<Array<{ sequence: bigint }>>`
        SELECT nextval(pg_get_serial_sequence('"AuditEvent"', 'sequence'))::bigint AS sequence
      `;

      const previous = await tx.auditEvent.findFirst({
        where: {
          entityType: input.entityType,
          entityId: input.entityId,
        },
        orderBy: { sequence: 'desc' },
        select: { hash: true },
      });

      const previousHash = previous?.hash ?? null;
      const payload = structuredClone(input.payload) as JsonValue;
      const createdAt = new Date(input.createdAt?.getTime() ?? Date.now());
      const draft = {
        id: randomUUID(),
        sequence,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        payload,
        previousHash,
        createdAt,
      };
      const hash = computeAuditHash(draft);

      const row = await tx.auditEvent.create({
        data: {
          id: draft.id,
          sequence: draft.sequence,
          actorUserId: draft.actorUserId,
          actorRole: draft.actorRole,
          eventType: draft.eventType,
          entityType: draft.entityType,
          entityId: draft.entityId,
          payload: payload as Prisma.InputJsonValue,
          previousHash: draft.previousHash,
          hash,
          createdAt: draft.createdAt,
        },
      });

      return this.toAuditEvent(row);
    });
  }

  async all(): Promise<readonly AuditEvent[]> {
    const rows = await this.prisma.auditEvent.findMany({
      orderBy: { sequence: 'asc' },
    });

    return rows.map((row) => this.toAuditEvent(row));
  }

  async forEntity(
    entityType: string,
    entityId: string,
  ): Promise<readonly AuditEvent[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { sequence: 'asc' },
    });

    return rows.map((row) => this.toAuditEvent(row));
  }

  private toAuditEvent(row: {
    id: string;
    sequence: bigint;
    actorUserId: string | null;
    actorRole: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    payload: Prisma.JsonValue;
    previousHash: string | null;
    hash: string;
    createdAt: Date;
  }): AuditEvent {
    return {
      id: row.id,
      sequence: row.sequence,
      actorUserId: row.actorUserId,
      actorRole: row.actorRole,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      payload: row.payload as JsonValue,
      previousHash: row.previousHash,
      hash: row.hash,
      createdAt: new Date(row.createdAt.getTime()),
    };
  }
}
