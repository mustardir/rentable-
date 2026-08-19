import { BadRequestException, Injectable } from '@nestjs/common';
import { PostingEngine } from '@fortress/ledger-core';
import { TransactionStatus, TransactionType, TransferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTransferDto } from './dto/create-transfer.dto';

const CUSTOMER_DEPOSITS_ACCOUNT_ID = 'acct_2100';

@Injectable()
export class TransfersService {
  private readonly postingEngine = new PostingEngine();

  constructor(private readonly prisma: PrismaService) {}

  async createTransfer(dto: CreateTransferDto) {
    const existing = await this.prisma.transfer.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { journalEntry: { include: { lines: true } } },
    });
    if (existing) {
      return existing;
    }

    if (dto.sourceUserId === dto.destinationUserId) {
      throw new BadRequestException('sourceUserId and destinationUserId must differ');
    }

    const amountKobo = this.parseAmountKobo(dto.amountKobo);
    const reference = dto.reference ?? `TRF-${dto.idempotencyKey}`;
    const currency = dto.currency ?? 'NGN';

    const entryResult = this.postingEngine.buildEntry({
      idempotencyKey: dto.idempotencyKey,
      lines: [
        {
          accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
          direction: 'DEBIT',
          amountKobo,
          metadata: {
            investorId: dto.sourceUserId,
            transferRole: 'source',
            reference,
          },
        },
        {
          accountId: CUSTOMER_DEPOSITS_ACCOUNT_ID,
          direction: 'CREDIT',
          amountKobo,
          metadata: {
            investorId: dto.destinationUserId,
            transferRole: 'destination',
            reference,
          },
        },
      ],
    });

    if (!entryResult.ok) {
      throw new BadRequestException(entryResult.error.message);
    }

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.transfer.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { journalEntry: { include: { lines: true } } },
      });
      if (duplicate) {
        return duplicate;
      }

      const transaction = await tx.transaction.create({
        data: {
          userId: dto.sourceUserId,
          type: TransactionType.TRANSFER,
          status: TransactionStatus.PROCESSING,
          amountKobo,
          currency,
          reference,
          idempotencyKey: dto.idempotencyKey,
          metadata: {
            sourceUserId: dto.sourceUserId,
            destinationUserId: dto.destinationUserId,
          },
        },
      });

      const journalEntry = await tx.journalEntry.create({
        data: {
          id: entryResult.value.id,
          idempotencyKey: entryResult.value.idempotencyKey,
          reference,
          description: `Transfer ${reference}`,
          currency,
          status: 'POSTED',
          postedAt: entryResult.value.postedAt,
          metadata: {
            transactionId: transaction.id,
            sourceUserId: dto.sourceUserId,
            destinationUserId: dto.destinationUserId,
          },
          createdAt: entryResult.value.createdAt,
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
        include: { lines: true },
      });

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.COMPLETED,
          journalEntryId: journalEntry.id,
          completedAt: new Date(),
        },
      });

      return tx.transfer.create({
        data: {
          sourceUserId: dto.sourceUserId,
          destinationUserId: dto.destinationUserId,
          status: TransferStatus.COMPLETED,
          amountKobo,
          currency,
          reference,
          idempotencyKey: dto.idempotencyKey,
          journalEntryId: journalEntry.id,
          metadata: { transactionId: transaction.id },
          completedAt: new Date(),
        },
        include: { journalEntry: { include: { lines: true } } },
      });
    });
  }

  private parseAmountKobo(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('amountKobo must be a positive integer string');
    }

    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new BadRequestException('amountKobo must be greater than 0');
    }

    return parsed;
  }
}
