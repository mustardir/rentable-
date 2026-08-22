import { Module } from '@nestjs/common';
import { PrismaAuditRepository } from './prisma-audit.repository';

@Module({
  providers: [PrismaAuditRepository],
  exports: [PrismaAuditRepository],
})
export class AuditModule {}
