import { PrismaClient, EntryDirection, TxStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface PostTransactionInput {
  reference: string;
  description?: string;
  amount: bigint;
  currency: string;
  debitBalanceId: string;
  creditBalanceId: string;
  metadata?: Record<string, any>;
}

export async function postTransaction(input: PostTransactionInput) {
  const { reference, description, amount, currency, debitBalanceId, creditBalanceId, metadata } = input;

  if (amount <= 0n) throw new Error('Transaction amount must be positive');
  if (debitBalanceId === creditBalanceId) throw new Error('Debit and credit accounts must differ');

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: { reference, description, amount, currency, status: TxStatus.APPLIED, metadata },
    });

    await tx.ledgerEntry.create({
      data: { transactionId: transaction.id, balanceId: debitBalanceId, direction: EntryDirection.DEBIT, amount },
    });
    await tx.ledgerEntry.create({
      data: { transactionId: transaction.id, balanceId: creditBalanceId, direction: EntryDirection.CREDIT, amount },
    });

    await tx.balance.update({
      where: { id: debitBalanceId },
      data: { debitBalance: { increment: amount }, balance: { decrement: amount } },
    });
    await tx.balance.update({
      where: { id: creditBalanceId },
      data: { creditBalance: { increment: amount }, balance: { increment: amount } },
    });

    return transaction;
  });
}
