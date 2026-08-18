import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { LedgerModule } from './ledger/ledger.module';
import { TransfersModule } from './transfers/transfers.module';

@Module({
  imports: [PrismaModule, HealthModule, LedgerModule, TransfersModule],
})
export class AppModule {}
