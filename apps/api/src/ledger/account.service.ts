import { PrismaClient, AccountType, AccountStatus } from '@prisma/client';
import { randomInt } from 'crypto';

const prisma = new PrismaClient();

interface OpenAccountInput {
  ledgerId: string;
  identityId: string;
  accountType: AccountType;
  currency?: string;
  initialInterestRateBps?: number;
  metadata?: Record<string, any>;
}

const DEFAULT_INTEREST_RATES: Partial<Record<AccountType, number>> = {
  SAVINGS: 400,
  LOAN: 1200,
  CHECKING: 0,
};

function generateAccountNumber(): string {
  return String(randomInt(1_000_000_000, 9_999_999_999));
}

export async function openAccount(input: OpenAccountInput) {
  const { ledgerId, identityId, accountType, currency = 'USD', initialInterestRateBps, metadata } = input;

  const internalTypes: AccountType[] = ['CASH_VAULT', 'INTEREST_EXPENSE', 'INTEREST_INCOME', 'FEE_INCOME'];
  if (internalTypes.includes(accountType)) {
    throw new Error(`${accountType} is an internal account type and cannot be opened via openAccount()`);
  }

  const interestRateBps = initialInterestRateBps ?? DEFAULT_INTEREST_RATES[accountType] ?? null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.balance.create({
        data: {
          ledgerId,
          identityId,
          accountType,
          accountStatus: AccountStatus.ACTIVE,
          accountNumber: generateAccountNumber(),
          interestRateBps,
          currency,
          balance: 0n,
          creditBalance: 0n,
          debitBalance: 0n,
          inflightCredit: 0n,
          inflightDebit: 0n,
          metadata,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002' && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error('Failed to generate a unique account number after 5 attempts');
}
