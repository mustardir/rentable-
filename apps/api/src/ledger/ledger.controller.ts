import { Controller, Get, Req, UseGuards } from '@nestjs/common';
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
}
