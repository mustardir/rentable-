import { Injectable, NotFoundException } from '@nestjs/common';
import { EntryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaBalanceRepository } from './prisma-balance.repository';

export interface LedgerTransaction {
  id: string;
  reference: string;
  description: string;
  currency: string;
  status: EntryStatus;
  direction: 'DEBIT' | 'CREDIT';
  amountKobo: string;
  postedAt: string;
  metadata: Record<string, string>;
}

@Injectable()
export class LedgerService {
  private readonly balanceRepository: PrismaBalanceRepository;

  constructor(private readonly prisma: PrismaService) {
    this.balanceRepository = new PrismaBalanceRepository(prisma);
  }

  async getMyBalance(userId: string): Promise<{ accountId: string; currency: string; balanceKobo: string }> {
    const mapping = await this.prisma.userLedgerAccount.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!mapping) throw new NotFoundException('LEDGER_ACCOUNT_NOT_FOUND');

    const account = await this.prisma.account.findUnique({ where: { id: mapping.accountId } });
    if (!account) throw new NotFoundException('ACCOUNT_NOT_FOUND');

    return {
      accountId: mapping.accountId,
      currency: mapping.currency,
      balanceKobo: (await this.balanceRepository.getInvestorBalance(mapping.accountId, userId)).toString(),
    };
  }

  async getMyTransactions(userId: string, limit = 20): Promise<LedgerTransaction[]> {
    const mapping = await this.prisma.userLedgerAccount.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!mapping) throw new NotFoundException('LEDGER_ACCOUNT_NOT_FOUND');

    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        status: EntryStatus.POSTED,
        lines: {
          some: {
            accountId: mapping.accountId,
            metadata: { path: ['investorId'], equals: userId },
          },
        },
      },
      include: { lines: true },
      orderBy: { postedAt: 'desc' },
      take: safeLimit,
    });

    return entries.flatMap((entry) => {
      const line = entry.lines.find(
        (candidate) =>
          candidate.accountId === mapping.accountId &&
          this.metadataValue(candidate.metadata, 'investorId') === userId,
      );
      if (!line) return [];

      return [{
        id: entry.id,
        reference: entry.reference,
        description: entry.description,
        currency: entry.currency,
        status: entry.status,
        direction: line.direction,
        amountKobo: line.amountKobo.toString(),
        postedAt: entry.postedAt.toISOString(),
        metadata: this.stringMetadata(entry.metadata),
      }];
    });
  }

  private metadataValue(metadata: Prisma.JsonValue | null, key: string): string | undefined {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const value = (metadata as Record<string, unknown>)[key];
    return value === undefined || value === null ? undefined : String(value);
  }

  private stringMetadata(metadata: Prisma.JsonValue | null): Record<string, string> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    return Object.fromEntries(
      Object.entries(metadata as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
    );
  }
}
