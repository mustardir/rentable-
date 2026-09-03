import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
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

  @Get('me/balance')
  getMyBalance(@Req() req: AuthenticatedRequest) {
    return this.ledgerService.getMyBalance(req.user.id);
  }

  @Get('me/transactions')
  getMyTransactions(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    const parsedLimit = limit === undefined ? 20 : Number(limit);
    return this.ledgerService.getMyTransactions(req.user.id, parsedLimit);
  }
}
