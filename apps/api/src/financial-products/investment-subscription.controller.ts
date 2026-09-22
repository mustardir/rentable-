import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvestmentSubscriptionService } from './investment-subscription.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller('investor/investments')
@UseGuards(JwtAuthGuard)
export class InvestmentSubscriptionController {
  constructor(private readonly subscriptions: InvestmentSubscriptionService) {}

  @Post('subscriptions/:id/fund')
  fund(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.subscriptions.fund(request.user.id, id);
  }

  @Post('subscriptions/:id/redeem')
  redeem(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { idempotencyKey: string },
  ) {
    return this.subscriptions.redeem(request.user.id, id, body.idempotencyKey);
  }

  @Post('subscriptions')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: {
      productId: string;
      amountMinor: string;
      currency: string;
      idempotencyKey: string;
      reference?: string;
    },
  ) {
    return this.subscriptions.create({ ...body, userId: request.user.id });
  }
}