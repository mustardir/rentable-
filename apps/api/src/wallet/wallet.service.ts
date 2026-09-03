import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PostingEngine } from '@fortress/ledger-core';
import { EntryStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaAuditRepository } from '../audit/prisma-audit.repository';
import type { CreateWalletRequestDto } from './dto/create-wallet-request.dto';

const INVESTOR_CASH_ACCOUNT_ID = 'acct_1100';
const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';
type WalletTransactionClient = Prisma.TransactionClient;

@Injectable()
export class WalletService {
  private readonly postingEngine = new PostingEngine();

  constructor(private readonly prisma: PrismaService, private readonly audit: PrismaAuditRepository) {}

  async getOperatorRequests(limit = 50) {
    return this.prisma.transaction.findMany({
      where: { type: { in: [TransactionType.DEPOSIT, TransactionType.WITHDRAWAL] }, status: TransactionStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: Math.min(100, Math.max(1, limit)),
      select: { id: true, type: true, status: true, amountKobo: true, currency: true, reference: true, idempotencyKey: true, journalEntryId: true, completedAt: true, createdAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  forbiddenOperator(): never { throw new ForbiddenException('Only an active admin or compliance user can access wallet approvals'); }

  async createDepositRequest(userId: string, dto: CreateWalletRequestDto) {
    await this.assertActiveUser(userId);
    return this.createRequest(userId, dto, TransactionType.DEPOSIT);
  }

  async createWithdrawalRequest(userId: string, dto: CreateWalletRequestDto) {
    await this.assertActiveUser(userId);
    return this.createRequest(userId, dto, TransactionType.WITHDRAWAL);
  }

  private async createRequest(userId: string, dto: CreateWalletRequestDto, type: TransactionType) {
    const amountKobo = this.parseAmountKobo(dto.amountKobo);
    const currency = dto.currency ?? 'NGN';
    const reference = dto.reference ?? `${type === TransactionType.DEPOSIT ? 'DEP' : 'WDR'}-${dto.idempotencyKey}`;
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId || existing.type !== type) throw new BadRequestException('idempotencyKey is already in use');
      return existing;
    }
    return this.prisma.transaction.create({ data: { userId, type, status: TransactionStatus.PENDING, amountKobo, currency, reference, idempotencyKey: dto.idempotencyKey, metadata: { workflow: type === TransactionType.DEPOSIT ? 'customer_deposit' : 'customer_withdrawal' } } });
  }

  async confirmRequest(transactionId: string, adminUserId: string) {
    const admin = await this.requireOperator(adminUserId);
    const result = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Wallet transaction not found');
      if (transaction.status === TransactionStatus.COMPLETED) return { transaction, changed: false };
      if (transaction.status !== TransactionStatus.PENDING) throw new BadRequestException(`Transaction cannot be confirmed from status ${transaction.status}`);
      const claimed = await tx.transaction.updateMany({ where: { id: transaction.id, status: TransactionStatus.PENDING }, data: { status: TransactionStatus.PROCESSING } });
      if (claimed.count !== 1) throw new BadRequestException('Transaction is already being processed');
      if (transaction.type === TransactionType.WITHDRAWAL) await this.assertSufficientBalance(tx, transaction.userId, transaction.amountKobo);

      const entryResult = this.postingEngine.buildEntry({
        idempotencyKey: `wallet:${transaction.idempotencyKey}`,
        lines: transaction.type === TransactionType.DEPOSIT
          ? [
              { accountId: INVESTOR_CASH_ACCOUNT_ID, direction: 'DEBIT', amountKobo: transaction.amountKobo, metadata: { investorId: transaction.userId, transactionType: 'DEPOSIT', reference: transaction.reference } },
              { accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, direction: 'CREDIT', amountKobo: transaction.amountKobo, metadata: { investorId: transaction.userId, transactionType: 'DEPOSIT', reference: transaction.reference } },
            ]
          : [
              { accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, direction: 'DEBIT', amountKobo: transaction.amountKobo, metadata: { investorId: transaction.userId, transactionType: 'WITHDRAWAL', reference: transaction.reference } },
              { accountId: INVESTOR_CASH_ACCOUNT_ID, direction: 'CREDIT', amountKobo: transaction.amountKobo, metadata: { investorId: transaction.userId, transactionType: 'WITHDRAWAL', reference: transaction.reference } },
            ],
      });
      if (!entryResult.ok) throw new BadRequestException(entryResult.error.message);
      const journalEntry = await tx.journalEntry.create({ data: { id: entryResult.value.id, idempotencyKey: entryResult.value.idempotencyKey, reference: transaction.reference, description: `${transaction.type === TransactionType.DEPOSIT ? 'Deposit' : 'Withdrawal'} ${transaction.reference}`, currency: transaction.currency, status: EntryStatus.POSTED, postedAt: entryResult.value.postedAt, createdAt: entryResult.value.createdAt, createdByUserId: adminUserId, metadata: { transactionId: transaction.id, confirmedByUserId: adminUserId }, lines: { create: entryResult.value.lines.map((line) => ({ id: line.id, accountId: line.accountId, direction: line.direction, amountKobo: line.amountKobo, metadata: line.metadata, createdAt: line.createdAt })) } } });
      const updated = await tx.transaction.update({ where: { id: transaction.id }, data: { status: TransactionStatus.COMPLETED, journalEntryId: journalEntry.id, completedAt: new Date(), metadata: { workflow: transaction.type === TransactionType.DEPOSIT ? 'customer_deposit' : 'customer_withdrawal', confirmedByUserId: adminUserId } } });
      return { transaction: updated, changed: true };
    });
    if (result.changed) {
      await this.audit.append({ actorUserId: admin.id, actorRole: admin.role, eventType: 'WALLET_REQUEST_APPROVED', entityType: 'Transaction', entityId: result.transaction.id, payload: { transactionId: result.transaction.id, reference: result.transaction.reference, type: result.transaction.type, amountKobo: result.transaction.amountKobo.toString(), currency: result.transaction.currency } });
    }
    return result.transaction;
  }

  async rejectRequest(transactionId: string, adminUserId: string, reason?: string) {
    const admin = await this.requireOperator(adminUserId);
    const normalizedReason = reason?.trim() || 'Rejected by operator';
    const result = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Wallet transaction not found');
      if (transaction.status === TransactionStatus.CANCELLED) return { transaction, changed: false };
      if (transaction.status !== TransactionStatus.PENDING) throw new BadRequestException(`Transaction cannot be rejected from status ${transaction.status}`);
      const updated = await tx.transaction.updateMany({ where: { id: transaction.id, status: TransactionStatus.PENDING }, data: { status: TransactionStatus.CANCELLED, metadata: { workflow: transaction.type === TransactionType.DEPOSIT ? 'customer_deposit' : 'customer_withdrawal', rejectedByUserId: adminUserId, rejectionReason: normalizedReason } } });
      if (updated.count !== 1) throw new BadRequestException('Transaction is already being processed');
      const cancelled = await tx.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
      return { transaction: cancelled, changed: true };
    });
    if (result.changed) {
      await this.audit.append({ actorUserId: admin.id, actorRole: admin.role, eventType: 'WALLET_REQUEST_REJECTED', entityType: 'Transaction', entityId: result.transaction.id, payload: { transactionId: result.transaction.id, reference: result.transaction.reference, type: result.transaction.type, amountKobo: result.transaction.amountKobo.toString(), currency: result.transaction.currency, reason: normalizedReason } });
    }
    return result.transaction;
  }

  private async requireOperator(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !['ADMIN', 'COMPLIANCE'].includes(user.role)) throw new ForbiddenException('Only an active admin or compliance user can perform wallet approvals');
    return user;
  }

  private async assertSufficientBalance(tx: WalletTransactionClient, userId: string, amountKobo: bigint) {
    const lines = await tx.journalLine.findMany({ where: { accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, metadata: { path: ['investorId'], equals: userId }, journalEntry: { status: EntryStatus.POSTED } }, select: { direction: true, amountKobo: true } });
    let availableKobo = 0n;
    for (const line of lines) availableKobo += line.direction === 'CREDIT' ? line.amountKobo : -line.amountKobo;
    if (availableKobo < amountKobo) throw new BadRequestException('Insufficient available balance');
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
