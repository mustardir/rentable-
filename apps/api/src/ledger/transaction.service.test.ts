import { PrismaClient } from '@prisma/client';
import { postTransaction } from './transaction.service';

const prisma = new PrismaClient();

describe('postTransaction', () => {
  let ledgerId: string;
  let debitBalanceId: string;
  let creditBalanceId: string;

  beforeAll(async () => {
    const ledger = await prisma.ledger.create({ data: { name: 'Test Ledger' } });
    ledgerId = ledger.id;

    const debit = await prisma.balance.create({
      data: { ledgerId, currency: 'USD', accountType: 'CHECKING' },
    });
    const credit = await prisma.balance.create({
      data: { ledgerId, currency: 'USD', accountType: 'CASH_VAULT' },
    });
    debitBalanceId = debit.id;
    creditBalanceId = credit.id;
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.balance.deleteMany({ where: { ledgerId } });
    await prisma.ledger.delete({ where: { id: ledgerId } });
    await prisma.$disconnect();
  });

  it('creates balanced debit and credit entries', async () => {
    const tx = await postTransaction({
      reference: 'test-tx-001',
      amount: 10_000n,
      currency: 'USD',
      debitBalanceId,
      creditBalanceId,
    });

    const debitBalance = await prisma.balance.findUnique({ where: { id: debitBalanceId } });
    const creditBalance = await prisma.balance.findUnique({ where: { id: creditBalanceId } });

    expect(debitBalance?.balance).toBe(-10_000n);
    expect(creditBalance?.balance).toBe(10_000n);
    expect(tx.amount).toBe(10_000n);
  });

  it('rejects zero or negative amounts', async () => {
    await expect(
      postTransaction({
        reference: 'test-tx-002',
        amount: 0n,
        currency: 'USD',
        debitBalanceId,
        creditBalanceId,
      })
    ).rejects.toThrow('Transaction amount must be positive');
  });

  it('rejects debit and credit being the same account', async () => {
    await expect(
      postTransaction({
        reference: 'test-tx-003',
        amount: 5_000n,
        currency: 'USD',
        debitBalanceId,
        creditBalanceId: debitBalanceId,
      })
    ).rejects.toThrow('Debit and credit accounts must differ');
  });

  it('enforces idempotency via unique reference', async () => {
    await postTransaction({
      reference: 'test-tx-idempotent',
      amount: 1_000n,
      currency: 'USD',
      debitBalanceId,
      creditBalanceId,
    });

    await expect(
      postTransaction({
        reference: 'test-tx-idempotent',
        amount: 1_000n,
        currency: 'USD',
        debitBalanceId,
        creditBalanceId,
      })
    ).rejects.toThrow();
  });

  it('keeps total debits and credits summed to zero across the ledger', async () => {
    const entries = await prisma.ledgerEntry.findMany({
      where: { balance: { ledgerId } },
    });

    const total = entries.reduce((sum, e) => {
      return e.direction === 'DEBIT' ? sum - e.amount : sum + e.amount;
    }, 0n);

    expect(total).toBe(0n);
  });
});
