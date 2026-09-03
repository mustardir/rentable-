import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import { CreateWalletRequestDto } from './dto/create-wallet-request.dto';
import { WalletService } from './wallet.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('requests')
  getRequests(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.walletService.getMyRequests(req.user.id, limit);
  }

  @Post('deposits')
  createDeposit(@Req() req: AuthenticatedRequest, @Body() dto: CreateWalletRequestDto) {
    return this.walletService.createDepositRequest(req.user.id, dto);
  }

  @Post('withdrawals')
  createWithdrawal(@Req() req: AuthenticatedRequest, @Body() dto: CreateWalletRequestDto) {
    return this.walletService.createWithdrawalRequest(req.user.id, dto);
  }

  @Post('transactions/:id/confirm')
  confirm(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.walletService.confirmRequest(id, req.user.id);
  }
}
