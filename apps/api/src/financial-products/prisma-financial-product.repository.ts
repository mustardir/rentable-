import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus, ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { FinancialProductRepository } from './financial-product.repository';
import type { CreateFinancialProductInput, FinancialProduct } from './financial-product.types';

@Injectable()
export class PrismaFinancialProductRepository implements FinancialProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateFinancialProductInput): Promise<FinancialProduct> {
    const product = await this.prisma.financialProduct.create({
      data: {
        code: input.code.trim(),
        name: input.name.trim(),
        type: input.type as ProductType,
        description: input.description ?? null,
        currency: input.currency ?? 'USD',
        minimumAmountMinor: input.minimumAmountMinor,
        status: (input.status ?? 'DRAFT') as ProductStatus,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return this.toDomain(product);
  }

  async findById(id: string): Promise<FinancialProduct | null> {
    const product = await this.prisma.financialProduct.findUnique({ where: { id } });
    return product ? this.toDomain(product) : null;
  }

  async findByCode(code: string): Promise<FinancialProduct | null> {
    const product = await this.prisma.financialProduct.findUnique({ where: { code } });
    return product ? this.toDomain(product) : null;
  }

  async listActive(): Promise<readonly FinancialProduct[]> {
    const products = await this.prisma.financialProduct.findMany({
      where: { status: ProductStatus.ACTIVE },
      orderBy: [{ createdAt: 'asc' }, { code: 'asc' }],
    });
    return products.map((product) => this.toDomain(product));
  }

  private toDomain(product: {
    id: string;
    code: string;
    name: string;
    type: ProductType;
    description: string | null;
    currency: string;
    minimumAmountMinor: bigint;
    status: ProductStatus;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): FinancialProduct {
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      type: product.type,
      description: product.description,
      currency: product.currency,
      minimumAmountMinor: product.minimumAmountMinor,
      status: product.status,
      metadata:
        product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
          ? (product.metadata as Record<string, unknown>)
          : {},
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
