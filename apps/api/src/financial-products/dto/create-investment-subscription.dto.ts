import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateInvestmentSubscriptionDto {
  @IsString()
  productId!: string;

  @IsString()
  @Matches(/^[0-9]+$/)
  amountMinor!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsString()
  @Matches(/\S+/)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
