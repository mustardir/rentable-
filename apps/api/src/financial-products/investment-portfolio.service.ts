import { BadRequestException, Injectable } from '@nestjs/common';
import { EntryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface InvestmentPortfolioPosition {
  productId: string;
  productCode: string;
  productName: string;
  currency: string;
  amountMinor: string;
}

@Injectable()
export class InvestmentPortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyPositions(userId: string, currency: string): Promise<InvestmentPortfolioPosition[]> {
    const normalizedCurrency = currency?.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new BadRequestException('INVALID_CURRENCY');
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: 'acct_2200',
        currency: normalizedCurrency,
        metadata: { path: ['investorId'], equals: userId },
        journalEntry: { status: EntryStatus.POSTED },
      },
      select: {
        direction: true,
        amountKobo: true,
        metadata: true,
      },
    });

    const subscriptionIds = [...new Set(
      lines
        .map((line) => this.metadataValue(line.metadata, 'subscriptionId'))
        .filter((value): value is string => Boolean(value)),
    )];

    if (subscriptionIds.length === 0) return [];

    const subscriptions = await this.prisma.investmentSubscription.findMany({
      where: {
        id: { in: subscriptionIds },
        userId,
        currency: normalizedCurrency,
      },
      include: { product: true },
    });

    const productBySubscriptionId = new Map(
      subscriptions.map((subscription) => [subscription.id, subscription.product]),
    );

    const balances = new Map<string, InvestmentPortfolioPosition & { amount: bigint }>();

    for (const line of lines) {
      const subscriptionId = this.metadataValue(line.metadata, 'subscriptionId');
      if (!subscriptionId) continue;

      const product = productBySubscriptionId.get(subscriptionId);
      if (!product) continue;

      const existing = balances.get(product.id);
      const signedAmount = line.direction === 'CREDIT' ? line.amountKobo : -line.amountKobo;

      if (existing) {
        existing.amount += signedAmount;
      } else {
        balances.set(product.id, {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          currency: product.currency,
          amount: signedAmount,
          amountMinor: '0',
        });
      }
    }

    return [...balances.values()]
      .filter((position) => position.amount > 0n)
      .sort((a, b) => a.productCode.localeCompare(b.productCode))
      .map(({ amount, ...position }) => ({
        ...position,
        amountMinor: amount.toString(),
      }));
  }

  private metadataValue(metadata: Prisma.JsonValue | null, key: string): string | undefined {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const value = (metadata as Record<string, unknown>)[key];
    return value === undefined || value === null ? undefined : String(value);
  }
}
