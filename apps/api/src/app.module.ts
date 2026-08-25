import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { LedgerModule } from './ledger/ledger.module';
import { TransfersModule } from './transfers/transfers.module';
import { AuditModule } from './audit/audit.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [PrismaModule, AuthModule, HealthModule, LedgerModule, TransfersModule, AuditModule, DocumentsModule],
})
export class AppModule {}
