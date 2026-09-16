import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ProvisionLedgerAccountInput {
  actorId: string;
  userId: string;
  accountId: string;
  currency: string;
}

@Injectable()
export class LedgerAccountMappingService {
  constructor(private readonly prisma: PrismaService) {}

  async provision(input: ProvisionLedgerAccountInput) {
    const currency = this.normalizeCurrency(input.currency);

    const actor = await this.prisma.user.findUnique({
      where: { id: input.actorId },
      select: { id: true, isActive: true, role: true },
    });

    if (!actor || !actor.isActive) {
      throw new ForbiddenException('PROVISIONING_ACTOR_NOT_AUTHORIZED');
    }

    if (![UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER].includes(actor.role)) {
      throw new ForbiddenException('PROVISIONING_ACTOR_NOT_AUTHORIZED');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, role: true },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('LEDGER_MAPPING_USER_NOT_FOUND');
    }

    if (user.role !== UserRole.INVESTOR) {
      throw new BadRequestException('LEDGER_MAPPING_REQUIRES_INVESTOR');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: input.accountId },
      select: { id: true, isActive: true },
    });

    if (!account || !account.isActive) {
      throw new NotFoundException('LEDGER_MAPPING_ACCOUNT_NOT_FOUND');
    }

    try {
      return await this.prisma.userLedgerAccount.create({
        data: {
          userId: user.id,
          accountId: account.id,
          currency,
          isActive: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('LEDGER_MAPPING_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  private normalizeCurrency(currency: string): string {
    const normalized = currency?.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new BadRequestException('INVALID_CURRENCY');
    }
    return normalized;
  }
}
