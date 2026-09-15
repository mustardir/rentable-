import { BadRequestException, Injectable } from '@nestjs/common';
import { PostingEngine } from '@fortress/ledger-core';
import { EntryStatus, TransactionStatus, TransactionType, TransferStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTransferDto } from './dto/create-transfer.dto';

const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';
type TransferTransactionClient = Prisma.TransactionClient;

@Injectable()
export class TransfersService {
  private readonly postingEngine = new PostingEngine();

  constructor(private readonly prisma: PrismaService) {}

  async createTransfer(dto: CreateTransferDto) {
    const currency = this.normalizeCurrency(dto.currency);
    const amountKobo = this.parseAmountKobo(dto.amountKobo);
    const reference = dto.reference ?? `TRF-${dto.idempotencyKey}`;
    const existing = await this.prisma.transfer.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { journalEntry: { include: { lines: true } } } });
    if (existing) {
      this.assertIdempotentReplay(existing, dto.sourceUserId, dto.destinationUserId, amountKobo, currency, reference);
      return existing;
    }
    if (dto.sourceUserId === dto.destinationUserId) throw new BadRequestException('sourceUserId and destinationUserId must differ');
    const entryResult = this.postingEngine.buildEntry({
      idempotencyKey: dto.idempotencyKey,
      lines: [
        { accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, direction: 'DEBIT', amountKobo, metadata: { investorId: dto.sourceUserId, transferRole: 'source', reference } },
        { accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, direction: 'CREDIT', amountKobo, metadata: { investorId: dto.destinationUserId, transferRole: 'destination', reference } },
      ],
    });
    if (!entryResult.ok) throw new BadRequestException(entryResult.error.message);
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.transfer.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { journalEntry: { include: { lines: true } } } });
      if (duplicate) {
        this.assertIdempotentReplay(duplicate, dto.sourceUserId, dto.destinationUserId, amountKobo, currency, reference);
        return duplicate;
      }
      await this.lockSourceBalance(tx, dto.sourceUserId, currency);
      await this.assertSufficientBalance(tx, dto.sourceUserId, currency, amountKobo);
      const transaction = await tx.transaction.create({ data: { userId: dto.sourceUserId, type: TransactionType.TRANSFER, status: TransactionStatus.PROCESSING, amountKobo, currency, reference, idempotencyKey: dto.idempotencyKey, metadata: { sourceUserId: dto.sourceUserId, destinationUserId: dto.destinationUserId } } });
      const journalEntry = await tx.journalEntry.create({ data: { id: entryResult.value.id, idempotencyKey: entryResult.value.idempotencyKey, reference, description: `Transfer ${reference}`, currency, status: 'POSTED', postedAt: entryResult.value.postedAt, metadata: { transactionId: transaction.id, sourceUserId: dto.sourceUserId, destinationUserId: dto.destinationUserId }, createdAt: entryResult.value.createdAt, lines: { create: entryResult.value.lines.map((line) => ({ id: line.id, accountId: line.accountId, currency, direction: line.direction, amountKobo: line.amountKobo, metadata: line.metadata, createdAt: line.createdAt })) } }, include: { lines: true } });
      await tx.transaction.update({ where: { id: transaction.id }, data: { status: TransactionStatus.COMPLETED, journalEntryId: journalEntry.id, completedAt: new Date() } });
      return tx.transfer.create({ data: { sourceUserId: dto.sourceUserId, destinationUserId: dto.destinationUserId, status: TransferStatus.COMPLETED, amountKobo, currency, reference, idempotencyKey: dto.idempotencyKey, journalEntryId: journalEntry.id, metadata: { transactionId: transaction.id }, completedAt: new Date() }, include: { journalEntry: { include: { lines: true } } } });
    });
  }

  private assertIdempotentReplay(existing: { sourceUserId: string; destinationUserId: string; amountKobo: bigint; currency: string; reference: string }, sourceUserId: string, destinationUserId: string, amountKobo: bigint, currency: string, reference: string) {
    if (existing.sourceUserId !== sourceUserId || existing.destinationUserId !== destinationUserId || existing.amountKobo !== amountKobo || existing.currency !== currency || existing.reference !== reference) {
      throw new BadRequestException('IDEMPOTENCY_CONFLICT');
    }
  }

  private async lockSourceBalance(tx: TransferTransactionClient, userId: string, currency: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`transfer:${userId}:${currency}`}, 0))::text`;
  }

  private async assertSufficientBalance(tx: TransferTransactionClient, userId: string, currency: string, amountKobo: bigint) {
    const lines = await tx.journalLine.findMany({ where: { accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID, metadata: { path: ['investorId'], equals: userId }, journalEntry: { status: EntryStatus.POSTED, currency } }, select: { direction: true, amountKobo: true } });
    let availableKobo = 0n;
    for (const line of lines) availableKobo += line.direction === 'CREDIT' ? line.amountKobo : -line.amountKobo;
    if (availableKobo < amountKobo) throw new BadRequestException('Insufficient available balance');
  }

  private normalizeCurrency(currency?: string): string {
    const normalized = currency?.trim().toUpperCase();
    if (normalized === undefined || !/^[A-Z]{3}$/.test(normalized)) throw new BadRequestException('INVALID_CURRENCY');
    return normalized;
  }

  private parseAmountKobo(value: string): bigint {
    if (!/^\d+$/.test(value)) throw new BadRequestException('amountKobo must be a positive integer string');
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new BadRequestException('amountKobo must be greater than 0');
    return parsed;
  }
}
