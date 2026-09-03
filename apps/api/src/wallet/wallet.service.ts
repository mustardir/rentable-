import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PostingEngine } from '@fortress/ledger-core';
import { EntryStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateWalletRequestDto } from './dto/create-wallet-request.dto';

const INVESTOR_CASH_ACCOUNT_ID = 'acct_1100';
const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';

@Injectable()
export class WalletService {
  private readonly postingEngine = new PostingEngine();

  constructor(private readonly prisma: PrismaService) {}

  async createDepositRequest(userId: string, dto: CreateWalletRequestDto) {
    await this.assertActiveUser(userId);
    const amountKobo = this.parseAmountKobo(dto.amountKobo);
    const currency = dto.currency ?? 'NGN';
    const reference = dto.reference ?? `DEP-${dto.idempotencyKey}`;

    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.userId !== userId || existing.type !== TransactionType.DEPOSIT) {
        throw new BadRequestException('idempotencyKey is already in use');
      }
      return existing;
    }

    return this.prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        amountKobo,
        currency,
        reference,
        idempotencyKey: dto.idempotencyKey,
        metadata: { workflow: 'customer_deposit' },
      },
    });
  }

  async createWithdrawalRequest(userId: string, dto: CreateWalletRequestDto) {
    await this.assertActiveUser(userId);
    const amountKobo = this.parseAmountKobo(dto.amountKobo);
    const currency = dto.currency ?? 'NGN';
    const reference = dto.reference ?? `WDR-${dto.idempotencyKey}`;

    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.userId !== userId || existing.type !== TransactionType.WITHDRAWAL) {
        throw new BadRequestException('idempotencyKey is already in use');
      }
      return existing;
    }

    return this.prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amountKobo,
        currency,
        reference,
        idempotencyKey: dto.idempotencyKey,
        metadata: { workflow: 'customer_withdrawal' },
      },
    });
  }

  async confirmRequest(transactionId: string, adminUserId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminUserId } });
    if (!admin || !admin.isActive || !['ADMIN', 'COMPLIANCE'].includes(admin.role)) {
      throw new ForbiddenException('Only an active admin or compliance user can confirm wallet transactions');
    }

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Wallet transaction not found');
      if (transaction.status === TransactionStatus.COMPLETED) return transaction;
      if (transaction.status !== TransactionStatus.PENDING) {
        throw new BadRequestException(`Transaction cannot be confirmed from status ${transaction.status}`);
      }

      const claimed = await tx.transaction.updateMany({
        where: { id: transaction.id, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.PROCESSING },
      });
      if (claimed.count !== 1) {
        const current = await tx.transaction.findUnique({ where: { id: transaction.id } });
        if (current?.status === TransactionStatus.COMPLETED) return current;
        throw new BadRequestException('Transaction is already being processed');
      }

      if (transaction.type === TransactionType.WITHDRAWAL) {
        const lines = await tx.journalLine.findMany({
          where: {
            accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
            metadata: { path: ['investorId'], equals: transaction.userId },
            journalEntry: { status: EntryStatus.POSTED },
          },
          select: { direction: true, amountKobo: true },
        });
        let availableKobo = 0n;
        for (const line of lines) {
          availableKobo += line.direction === 'CREDIT' ? line.amountKobo : -line.amountKobo;
        }
        if (availableKobo < transaction.amountKobo) {
          throw new BadRequestException('Insufficient available balance');
        }
      }

      const entryResult = this.postingEngine.buildEntry({
        idempotencyKey: `wallet:${transaction.idempotencyKey}`,
        lines: transaction.type === TransactionType.DEPOSIT
          ? [
              {
                accountId: INVESTOR_CASH_ACCOUNT_ID,
                direction: 'DEBIT',
                amountKobo: transaction.amountKobo,
                metadata: { investorId: transaction.userId, transactionType: 'DEPOSIT', reference: transaction.reference },
              },
              {
                accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
                direction: 'CREDIT',
                amountKobo: transaction.amountKobo,
                metadata: { investorId: transaction.userId, transactionType: 'DEPOSIT', reference: transaction.reference },
              },
            ]
          : [
              {
                accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
                direction: 'DEBIT',
                amountKobo: transaction.amountKobo,
                metadata: { investorId: transaction.userId, transactionType: 'WITHDRAWAL', reference: transaction.reference },
              },
              {
                accountId: INVESTOR_CASH_ACCOUNT_ID,
                direction: 'CREDIT',
                amountKobo: transaction.amountKobo,
                metadata: { investorId: transaction.userId, transactionType: 'WITHDRAWAL', reference: transaction.reference },
              },
            ],
      });

      if (!entryResult.ok) throw new BadRequestException(entryResult.error.message);

      const journalEntry = await tx.journalEntry.create({
        data: {
          id: entryResult.value.id,
          idempotencyKey: entryResult.value.idempotencyKey,
          reference: transaction.reference,
          description: `${transaction.type === TransactionType.DEPOSIT ? 'Deposit' : 'Withdrawal'} ${transaction.reference}`,
          currency: transaction.currency,
          status: EntryStatus.POSTED,
          postedAt: entryResult.value.postedAt,
          createdAt: entryResult.value.createdAt,
          createdByUserId: adminUserId,
          metadata: { transactionId: transaction.id, confirmedByUserId: adminUserId },
          lines: {
            create: entryResult.value.lines.map((line) => ({
              id: line.id,
              accountId: line.accountId,
              direction: line.direction,
              amountKobo: line.amountKobo,
              metadata: line.metadata,
              createdAt: line.createdAt,
            })),
          },
        },
      });

      return tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.COMPLETED,
          journalEntryId: journalEntry.id,
          completedAt: new Date(),
          metadata: { workflow: transaction.type === TransactionType.DEPOSIT ? 'customer_deposit' : 'customer_withdrawal', confirmedByUserId: adminUserId },
        },
      });
    });
  }

  private async assertActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } });
    if (!user || !user.isActive) throw new NotFoundException('Investor not found');
  }

  private parseAmountKobo(value: string): bigint {
    if (!/^\d+$/.test(value)) throw new BadRequestException('amountKobo must be a positive integer string');
    const amount = BigInt(value);
    if (amount <= 0n) throw new BadRequestException('amountKobo must be greater than 0');
    return amount;
  }
}
