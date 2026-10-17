import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvestmentSubscriptionInput, InvestmentSubscription } from './investment-subscription.types';
import type { InvestmentSubscriptionRepository } from './investment-subscription.repository';

@Injectable()
export class PrismaInvestmentSubscriptionRepository implements InvestmentSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateInvestmentSubscriptionInput): Promise<InvestmentSubscription> {
    const subscription = await this.prisma.investmentSubscription.create({
      data: {
        userId: input.userId,
        productId: input.productId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        reference: input.reference ?? ('INV-' + input.idempotencyKey),
      },
    });
    return subscription;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<InvestmentSubscription | null> {
    return this.prisma.investmentSubscription.findUnique({ where: { idempotencyKey } });
  }
}