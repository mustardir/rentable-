export class CreateTransferDto {
  sourceUserId!: string;
  destinationUserId!: string;
  amountKobo!: string;
  idempotencyKey!: string;
  reference?: string;
  currency?: string;
}
