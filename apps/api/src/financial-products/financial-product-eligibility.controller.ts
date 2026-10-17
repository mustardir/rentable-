import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FinancialProductEligibilityService } from './financial-product-eligibility.service';

type AuthenticatedRequest = Request & {
  user: { id: string };
};

@Controller('investor/products')
@UseGuards(JwtAuthGuard)
export class FinancialProductEligibilityController {
  constructor(private readonly eligibility: FinancialProductEligibilityService) {}

  @Get(':id/eligibility')
  check(@Req() request: AuthenticatedRequest, @Param('id') productId: string) {
    return this.eligibility.check(request.user.id, productId);
  }
}
