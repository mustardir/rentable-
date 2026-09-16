import { Module } from '@nestjs/common';
import { PrismaLedgerRepository } from './prisma-ledger.repository';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { LedgerAccountMappingService } from './ledger-account-mapping.service';

@Module({
  controllers: [LedgerController],
  providers: [PrismaLedgerRepository, LedgerService, LedgerAccountMappingService],
  exports: [PrismaLedgerRepository, LedgerService, LedgerAccountMappingService],
})
export class LedgerModule {}
