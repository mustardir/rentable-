import { IsNotEmpty, IsString } from 'class-validator';

export class ProvisionLedgerAccountDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;
}
