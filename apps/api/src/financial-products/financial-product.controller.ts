import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FinancialProductService } from './financial-product.service';

@Controller('investor/products')
@UseGuards(JwtAuthGuard)
export class FinancialProductController {
  constructor(private readonly service: FinancialProductService) {}

  @Get()
  async listActive() {
    return (await this.service.listActive()).map((product) => this.serialize(product));
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const product = await this.service.findById(id);
    if (!product) throw new NotFoundException('FINANCIAL_PRODUCT_NOT_FOUND');
    return this.serialize(product);
  }

  private serialize<T extends { minimumAmountMinor: bigint }>(
    value: T,
  ): Omit<T, 'minimumAmountMinor'> & { minimumAmountMinor: string } {
    return {
      ...value,
      minimumAmountMinor: value.minimumAmountMinor.toString(),
    };
  }
}
