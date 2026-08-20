import { Injectable, NotFoundException } from '@nestjs/common';
import { BalanceService } from '@fortress/ledger-core';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LedgerService {
  private readonly balanceService = new BalanceService();

  constructor(private readonly prisma: PrismaService) {}

  private async calculateAccountBalance(accountId: string): Promise<string> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('ACCOUNT_NOT_FOUND');

    const entries = await this.prisma.journalEntry.findMany({
      where: { status: 'POSTED' },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });

    const domainEntries = entries.map((entry) => ({
      id: entry.id,
      idempotencyKey: entry.idempotencyKey,
      status: entry.status,
      lines: entry.lines.map((line) => ({
        id: line.id,
        journalEntryId: line.journalEntryId,
        accountId: line.accountId,
        direction: line.direction,
        amountKobo: line.amountKobo,
        metadata: {},
        createdAt: line.createdAt,
      })),
      postedAt: entry.postedAt,
      reversalOfId: entry.reversalOfId ?? undefined,
      reversedById: entry.reversedById ?? undefined,
      createdAt: entry.createdAt,
    }));

    return this.balanceService.getAccountBalance(accountId, domainEntries).toString();
  }

  async getMyBalance(userId: string): Promise<{ accountId: string; currency: string; balanceKobo: string }> {
    const mapping = await this.prisma.userLedgerAccount.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!mapping) throw new NotFoundException('LEDGER_ACCOUNT_NOT_FOUND');

    return {
      accountId: mapping.accountId,
      currency: mapping.currency,
      balanceKobo: await this.calculateAccountBalance(mapping.accountId),
    };
  }

  async getAccountBalance(accountId: string): Promise<{ accountId: string; balanceKobo: string }> {
    return { accountId, balanceKobo: await this.calculateAccountBalance(accountId) };
  }
}
