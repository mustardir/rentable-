import { BadRequestException, Injectable } from '@nestjs/common';
import { FinancialProductEligibilityService } from './financial-product-eligibility.service';
import { FinancialProductService } from './financial-product.service';
import type { InvestmentSubscriptionRepository } from './investment-subscription.repository';
import type { InvestmentSubscription } from './investment-subscription.types';

@Injectable()
export class InvestmentSubscriptionService {
  constructor(
    private readonly products: FinancialProductService,
    private readonly eligibility: FinancialProductEligibilityService,
    private readonly repository: InvestmentSubscriptionRepository,
  ) {}

  async create(input: {
    userId: string;
    productId: string;
    amountMinor: string;
    currency: string;
    idempotencyKey: string;
    reference?: string;
  }): Promise<InvestmentSubscription> {
    const product = await this.products.findById(input.productId);
    if (!product) throw new BadRequestException('FINANCIAL_PRODUCT_NOT_FOUND');

    if (!input.idempotencyKey?.trim()) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    if (!/^[0-9]+$/.test(input.amountMinor)) throw new BadRequestException('INVALID_AMOUNT');
    const amountMinor = BigInt(input.amountMinor);
    if (amountMinor <= 0n) throw new BadRequestException('INVALID_AMOUNT');

    const currency = input.currency?.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('INVALID_CURRENCY');
    if (currency !== product.currency) throw new BadRequestException('CURRENCY_MISMATCH');
    if (amountMinor < product.minimumAmountMinor) throw new BadRequestException('AMOUNT_BELOW_PRODUCT_MINIMUM');

    const eligibility = await this.eligibility.check(input.userId, input.productId);
    if (!eligibility.eligible) throw new BadRequestException(eligibility.reason);

    const reference = input.reference ?? ('INV-' + input.idempotencyKey);
    const existing = await this.repository.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.productId !== input.productId ||
        existing.amountMinor !== amountMinor ||
        existing.currency !== currency ||
        existing.reference !== reference
      ) {
        throw new BadRequestException('IDEMPOTENCY_CONFLICT');
      }
      return existing;
    }

    return this.repository.create({
      userId: input.userId,
      productId: input.productId,
      amountMinor,
      currency,
      idempotencyKey: input.idempotencyKey,
      reference: input.reference,
    });
  }
}