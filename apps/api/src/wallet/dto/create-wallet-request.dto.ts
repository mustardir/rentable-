export class CreateWalletRequestDto {
  amountKobo!: string;
  idempotencyKey!: string;
  reference?: string;
  currency?: string;
}
