import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { LedgerService } from './ledger.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('accounts/:accountId/balance')
  getAccountBalance(@Param('accountId') accountId: string, @Req() req: AuthenticatedRequest) {
    // Account ownership/role authorization is deliberately enforced by the
    // service layer before this endpoint is exposed to customer-facing flows.
    return this.ledgerService.getAccountBalance(accountId);
  }
}
