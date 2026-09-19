import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FinancialProductController } from './financial-product.controller';
import { PrismaFinancialProductRepository } from './prisma-financial-product.repository';
import { FinancialProductService } from './financial-product.service';
import { FinancialProductEligibilityController } from './financial-product-eligibility.controller';
import { FinancialProductEligibilityService } from './financial-product-eligibility.service';

@Module({
  controllers: [FinancialProductController, FinancialProductEligibilityController],
  providers: [
    FinancialProductService,
    FinancialProductEligibilityService,
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
