import { Injectable } from '@nestjs/common';
import { EntryStatus, Prisma } from '@prisma/client';
import { BalanceService, koboFromBigInt, type JournalEntryStatus } from '@fortress/ledger-core';
import { PrismaService } from '../prisma/prisma.service';

type PrismaEntryWithLines = Prisma.JournalEntryGetPayload<{ include: { lines: true } }>;

@Injectable()
export class PrismaBalanceRepository {
  private readonly balanceService = new BalanceService();

  constructor(private readonly prisma: PrismaService) {}

  async getAccountBalance(accountId: string): Promise<bigint> {
    const entries = await this.loadPostedEntries();
    return this.balanceService.getAccountBalance(accountId, entries);
  }

  async getInvestorBalance(accountId: string, investorId: string): Promise<bigint> {
    const entries = await this.loadPostedEntries();
    return this.balanceService.getInvestorBalance(accountId, investorId, entries);
  }

  private async loadPostedEntries() {
    const entries = await this.prisma.journalEntry.findMany({
      where: { status: EntryStatus.POSTED },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });

    return entries.map((entry) => this.toDomain(entry));
  }

  private toDomain(entry: PrismaEntryWithLines) {
    return {
      id: entry.id,
      idempotencyKey: entry.idempotencyKey,
      status: entry.status as JournalEntryStatus,
      lines: entry.lines.map((line) => {
        const amount = koboFromBigInt(line.amountKobo);
        if (!amount.ok) {
          throw new Error(`INVALID_LEDGER_AMOUNT:${amount.error.kind}`);
        }

        const metadata: Record<string, string> = {};
        if (line.metadata && typeof line.metadata === 'object' && !Array.isArray(line.metadata)) {
          const investorId = (line.metadata as Record<string, unknown>).investorId;
          if (investorId != null) metadata.investorId = String(investorId);
        }

        return {
          id: line.id,
          journalEntryId: line.journalEntryId,
          accountId: line.accountId,
          direction: line.direction,
          amountKobo: amount.value,
          metadata,
          createdAt: line.createdAt,
        };
      }),
      postedAt: entry.postedAt,
      reversalOfId: entry.reversalOfId ?? undefined,
      reversedById: entry.reversedById ?? undefined,
      createdAt: entry.createdAt,
    };
  }
}
