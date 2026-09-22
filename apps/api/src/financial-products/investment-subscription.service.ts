import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PostingEngine } from '@fortress/ledger-core';
import { EntryStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaLedgerRepository } from '../ledger/prisma-ledger.repository';
import { FinancialProductEligibilityService } from './financial-product-eligibility.service';
import { FinancialProductService } from './financial-product.service';
import type { InvestmentSubscriptionRepository } from './investment-subscription.repository';
import type { InvestmentSubscription } from './investment-subscription.types';

@Injectable()
export class InvestmentSubscriptionService {
  private readonly postingEngine = new PostingEngine();

  constructor(
    private readonly products: FinancialProductService,
    private readonly eligibility: FinancialProductEligibilityService,
    @Inject('InvestmentSubscriptionRepository')
    private readonly repository: InvestmentSubscriptionRepository,
    private readonly prisma: PrismaService,
    private readonly ledgerRepository: PrismaLedgerRepository,
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

  async fund(userId: string, subscriptionId: string): Promise<InvestmentSubscription> {
    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.investmentSubscription.findUnique({
        where: { id: subscriptionId },
        include: { product: true },
      });
      if (!subscription) throw new NotFoundException('INVESTMENT_SUBSCRIPTION_NOT_FOUND');
      if (subscription.userId !== userId) throw new BadRequestException('INVESTMENT_SUBSCRIPTION_ACCESS_DENIED');
      if (subscription.status === 'COMPLETED') return subscription;
      if (subscription.status !== 'PENDING') throw new BadRequestException('INVESTMENT_SUBSCRIPTION_NOT_FUNDABLE');
      if (subscription.product.status !== 'ACTIVE') throw new BadRequestException('FINANCIAL_PRODUCT_NOT_ACTIVE');

      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'investment:' + userId + ':' + subscription.currency}, 0))::text`;

      const existingTransaction = await tx.transaction.findUnique({
        where: { idempotencyKey: 'INVEST-FUND-' + subscription.idempotencyKey },
      });
      if (existingTransaction?.journalEntryId) {
        return tx.investmentSubscription.update({
          where: { id: subscription.id },
          data: {
            status: TransactionStatus.COMPLETED,
            journalEntryId: existingTransaction.journalEntryId,
            transactionId: existingTransaction.id,
          },
        });
      }

      const balanceLines = await tx.journalLine.findMany({
        where: {
          accountId: 'acct_2100',
          currency: subscription.currency,
          metadata: { path: ['investorId'], equals: userId },
          journalEntry: { status: EntryStatus.POSTED },
        },
        select: { direction: true, amountKobo: true },
      });

      let available = 0n;
      for (const line of balanceLines) {
        available += line.direction === 'CREDIT' ? line.amountKobo : -line.amountKobo;
      }
      if (available < subscription.amountMinor) throw new BadRequestException('INSUFFICIENT_AVAILABLE_BALANCE');

      const transactionKey = 'INVEST-FUND-' + subscription.idempotencyKey;
      const transaction = existingTransaction ?? await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.INVESTMENT_PURCHASE,
          status: TransactionStatus.PROCESSING,
          amountKobo: subscription.amountMinor,
          currency: subscription.currency,
          reference: subscription.reference,
          idempotencyKey: transactionKey,
          investmentSubscriptionId: subscription.id,
          metadata: { subscriptionId: subscription.id, productId: subscription.productId },
        },
      });

      const entryResult = this.postingEngine.buildEntry({
        idempotencyKey: transactionKey,
        currency: subscription.currency,
        lines: [
          {
            accountId: 'acct_2100',
            direction: 'DEBIT',
            amountKobo: subscription.amountMinor,
            metadata: { investorId: userId, subscriptionId: subscription.id, role: 'investor-funding' },
          },
          {
            accountId: 'acct_2200',
            direction: 'CREDIT',
            amountKobo: subscription.amountMinor,
            metadata: { investorId: userId, subscriptionId: subscription.id, role: 'product-obligation' },
          },
        ],
      });
      if (!entryResult.ok) throw new BadRequestException(entryResult.error.message);

      const journalEntry = await this.ledgerRepository.saveEntry(entryResult.value, tx);

      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.COMPLETED, journalEntryId: journalEntry.id, completedAt: new Date() },
      });

      return tx.investmentSubscription.update({
        where: { id: subscription.id },
        data: { status: 'COMPLETED', journalEntryId: journalEntry.id, transactionId: transaction.id },
      });
    });
  }

  async redeem(userId: string, subscriptionId: string, idempotencyKey: string): Promise<InvestmentSubscription> {
    if (!idempotencyKey?.trim()) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.investmentSubscription.findUnique({
        where: { id: subscriptionId },
        include: { product: true },
      });
      if (!subscription) throw new NotFoundException('INVESTMENT_SUBSCRIPTION_NOT_FOUND');
      if (subscription.userId !== userId) throw new BadRequestException('INVESTMENT_SUBSCRIPTION_ACCESS_DENIED');
      if (subscription.status !== 'COMPLETED') throw new BadRequestException('INVESTMENT_SUBSCRIPTION_NOT_REDEEMABLE');

      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'investment:' + userId + ':' + subscription.currency}, 0))::text`;

      const transactionKey = 'INVEST-REDEEM-' + idempotencyKey;
      const existingTransaction = await tx.transaction.findUnique({ where: { idempotencyKey: transactionKey } });
      if (existingTransaction) {
        const metadata = existingTransaction.metadata as Prisma.JsonObject | null;
        if (metadata?.subscriptionId !== subscription.id || existingTransaction.userId !== userId) {
          throw new BadRequestException('IDEMPOTENCY_CONFLICT');
        }
        if (existingTransaction.journalEntryId) {
          await tx.transaction.update({
            where: { id: existingTransaction.id },
            data: { investmentSubscriptionId: subscription.id },
          });
          return subscription;
        }
      }

      const positionLines = await tx.journalLine.findMany({
        where: {
          accountId: 'acct_2200',
          currency: subscription.currency,
          metadata: { path: ['investorId'], equals: userId },
          journalEntry: { status: EntryStatus.POSTED },
        },
        select: { direction: true, amountKobo: true },
      });

      let position = 0n;
      for (const line of positionLines) {
        position += line.direction === 'CREDIT' ? line.amountKobo : -line.amountKobo;
      }
      if (position < subscription.amountMinor) throw new BadRequestException('INSUFFICIENT_INVESTMENT_POSITION');

      const transaction = existingTransaction ?? await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.REDEMPTION,
          status: TransactionStatus.PROCESSING,
          amountKobo: subscription.amountMinor,
          currency: subscription.currency,
          reference: 'REDEEM-' + idempotencyKey,
          idempotencyKey: transactionKey,
          metadata: { subscriptionId: subscription.id, productId: subscription.productId },
        },
      });

      const entryResult = this.postingEngine.buildEntry({
        idempotencyKey: transactionKey,
        currency: subscription.currency,
        lines: [
          {
            accountId: 'acct_2200',
            direction: 'DEBIT',
            amountKobo: subscription.amountMinor,
            metadata: { investorId: userId, subscriptionId: subscription.id, role: 'product-redemption' },
          },
          {
            accountId: 'acct_2100',
            direction: 'CREDIT',
            amountKobo: subscription.amountMinor,
            metadata: { investorId: userId, subscriptionId: subscription.id, role: 'investor-cash-credit' },
          },
        ],
      });
      if (!entryResult.ok) throw new BadRequestException(entryResult.error.message);

      const journalEntry = await this.ledgerRepository.saveEntry(entryResult.value, tx);

      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.COMPLETED, journalEntryId: journalEntry.id, completedAt: new Date() },
      });

      return subscription;
    });
  }

}
