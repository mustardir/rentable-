import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateInvestmentSubscriptionDto } from './dto/create-investment-subscription.dto';
import { RedeemInvestmentSubscriptionDto } from './dto/redeem-investment-subscription.dto';
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
    @Body() body: RedeemInvestmentSubscriptionDto,
  ) {
    return this.subscriptions.redeem(request.user.id, id, body.idempotencyKey);
  }

  @Post('subscriptions')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateInvestmentSubscriptionDto,
  ) {
    return this.subscriptions.create({ ...body, userId: request.user.id });
  }
}