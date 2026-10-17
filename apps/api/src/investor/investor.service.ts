import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvestorService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfileForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            dateOfBirth: true,
            country: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user || !user.isActive) throw new NotFoundException('Investor not found');

    return user;
  }
}
