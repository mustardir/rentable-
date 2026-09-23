import { IsString, Matches } from 'class-validator';

export class RedeemInvestmentSubscriptionDto {
  @IsString()
  @Matches(/\S+/)
  idempotencyKey!: string;
}
