import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import { CreateWalletRequestDto } from './dto/create-wallet-request.dto';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedRequest extends Request { user: { id: string; email: string; role: string }; }

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService, private readonly prisma: PrismaService) {}

  @Get('requests')
  async getRequests(@Req() req: AuthenticatedRequest, @Query('limit') rawLimit?: string) {
    const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : 20;
    const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 20;
    return this.prisma.transaction.findMany({ where: { userId: req.user.id, type: { in: [TransactionType.DEPOSIT, TransactionType.WITHDRAWAL] } }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, type: true, status: true, amountKobo: true, currency: true, reference: true, idempotencyKey: true, journalEntryId: true, completedAt: true, createdAt: true } });
  }

  @Get('admin/requests')
  async getAdminRequests(@Req() req: AuthenticatedRequest, @Query('limit') rawLimit?: string) {
    if (!['ADMIN', 'COMPLIANCE'].includes(req.user.role)) return this.walletService.forbiddenOperator();
    const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
    const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
    return this.walletService.getOperatorRequests(limit);
  }

  @Post('deposits')
  createDeposit(@Req() req: AuthenticatedRequest, @Body() dto: CreateWalletRequestDto) { return this.walletService.createDepositRequest(req.user.id, dto); }

  @Post('withdrawals')
  createWithdrawal(@Req() req: AuthenticatedRequest, @Body() dto: CreateWalletRequestDto) { return this.walletService.createWithdrawalRequest(req.user.id, dto); }

  @Post('transactions/:id/confirm')
  confirm(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.walletService.confirmRequest(id, req.user.id); }

  @Post('transactions/:id/reject')
  reject(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('reason') reason?: string) { return this.walletService.rejectRequest(id, req.user.id, reason); }
}
