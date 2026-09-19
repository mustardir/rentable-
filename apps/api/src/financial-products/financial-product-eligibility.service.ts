import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialProductService } from './financial-product.service';

export type FinancialProductEligibility = {
  eligible: boolean;
  productId: string;
  userId: string;
  reason: 'ELIGIBLE' | 'PRODUCT_NOT_FOUND' | 'PRODUCT_NOT_ACTIVE' | 'KYC_NOT_APPROVED';
  kycStatus: string | null;
  kycLevel: string | null;
};

@Injectable()
export class FinancialProductEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: FinancialProductService,
  ) {}

  async check(userId: string, productId: string): Promise<FinancialProductEligibility> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException('FINANCIAL_PRODUCT_NOT_FOUND');
    }

    const latestKyc = await this.prisma.kYCRecord.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { status: true, level: true },
    });

    if (product.status !== 'ACTIVE') {
      return {
        eligible: false,
        productId,
        userId,
        reason: 'PRODUCT_NOT_ACTIVE',
        kycStatus: latestKyc?.status ?? null,
        kycLevel: latestKyc?.level ?? null,
      };
    }

    if (latestKyc?.status !== 'APPROVED') {
      return {
        eligible: false,
        productId,
        userId,
        reason: 'KYC_NOT_APPROVED',
        kycStatus: latestKyc?.status ?? null,
        kycLevel: latestKyc?.level ?? null,
      };
    }

    return {
      eligible: true,
      productId,
      userId,
      reason: 'ELIGIBLE',
      kycStatus: latestKyc.status,
      kycLevel: latestKyc.level,
    };
  }
}
