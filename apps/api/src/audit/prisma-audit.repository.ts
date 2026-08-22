import { Injectable } from '@nestjs/common';
import type { AuditEvent, AuditEventInput } from '@fortress/audit-core';

import { PrismaService } from '../prisma/prisma.service';
import type { AuditRepository } from './audit.repository';

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AuditEventInput): Promise<AuditEvent> {
    throw new Error('NOT_IMPLEMENTED');
  }

  async all(): Promise<readonly AuditEvent[]> {
    throw new Error('NOT_IMPLEMENTED');
  }

  async forEntity(
    entityType: string,
    entityId: string,
  ): Promise<readonly AuditEvent[]> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
