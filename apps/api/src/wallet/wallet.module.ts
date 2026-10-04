import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [AuditModule, LedgerModule],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}
