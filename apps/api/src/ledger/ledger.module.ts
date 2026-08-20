import { Module } from '@nestjs/common';
import { PrismaLedgerRepository } from './prisma-ledger.repository';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

@Module({
  controllers: [LedgerController],
  providers: [PrismaLedgerRepository, LedgerService],
  exports: [PrismaLedgerRepository, LedgerService],
})
export class LedgerModule {}
