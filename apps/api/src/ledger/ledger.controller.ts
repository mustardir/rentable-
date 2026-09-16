import { Body, Controller, Get, Post, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { LedgerService } from './ledger.service';
import { LedgerAccountMappingService } from './ledger-account-mapping.service';
import { ProvisionLedgerAccountDto } from './dto/provision-ledger-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly ledgerAccountMappingService: LedgerAccountMappingService,
  ) {}

  @Get('me/balance')
  getMyBalance(@Req() req: AuthenticatedRequest, @Query('currency') currency?: string) {
    return this.ledgerService.getMyBalance(req.user.id, currency ?? '');
  }

  @Get('me/transactions')
  getMyTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('currency') currency?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit === undefined ? 20 : Number(limit);
    return this.ledgerService.getMyTransactions(req.user.id, currency ?? '', parsedLimit);
  }

  @Post('accounts/mappings')
  provisionLedgerAccountMapping(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ProvisionLedgerAccountDto,
  ) {
    const role = req.user.role as UserRole;
    const allowedRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER];

    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException('PROVISIONING_ACTOR_NOT_AUTHORIZED');
    }

    return this.ledgerAccountMappingService.provision({
      actorId: req.user.id,
      userId: dto.userId,
      accountId: dto.accountId,
      currency: dto.currency,
    });
  }
}
