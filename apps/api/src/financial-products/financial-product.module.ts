import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FinancialProductController } from './financial-product.controller';
import { PrismaFinancialProductRepository } from './prisma-financial-product.repository';
import { FinancialProductService } from './financial-product.service';
import { FinancialProductEligibilityController } from './financial-product-eligibility.controller';
import { FinancialProductEligibilityService } from './financial-product-eligibility.service';
import { InvestmentSubscriptionController } from './investment-subscription.controller';
import { InvestmentSubscriptionService } from './investment-subscription.service';
import { PrismaInvestmentSubscriptionRepository } from './prisma-investment-subscription.repository';

@Module({
  controllers: [FinancialProductController, FinancialProductEligibilityController, InvestmentSubscriptionController],
  providers: [
    FinancialProductService,
    FinancialProductEligibilityService,
    InvestmentSubscriptionService,
    PrismaInvestmentSubscriptionRepository,
    {
      provide: 'InvestmentSubscriptionRepository',
      useExisting: PrismaInvestmentSubscriptionRepository,
    },
    JwtAuthGuard,
    PrismaFinancialProductRepository,
    {
      provide: 'FinancialProductRepository',
      useExisting: PrismaFinancialProductRepository,
    },
  ],
  exports: [FinancialProductService],
})
export class FinancialProductModule {}
