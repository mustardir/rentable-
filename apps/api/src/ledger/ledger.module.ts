import { Module } from '@nestjs/common';
import { PrismaLedgerRepository } from './prisma-ledger.repository';

@Module({
  providers: [PrismaLedgerRepository],
  exports: [PrismaLedgerRepository],
})
export class LedgerModule {}
