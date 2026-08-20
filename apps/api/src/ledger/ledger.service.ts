import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaBalanceRepository } from './prisma-balance.repository';

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
}
