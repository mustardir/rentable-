import { PrismaClient, EntryStatus, Direction, AccountType } from '@prisma/client';
import { LedgerService } from '../src/ledger/ledger.service';

const prisma = new PrismaClient();
const DATABASE_URL = process.env.DATABASE_URL;
const describePrisma = DATABASE_URL ? describe : describe.skip;

const ACCOUNT_A = 'acct_1100';
const ACCOUNT_B = 'acct_2100';

describePrisma('Fortress Ledger Currency Isolation (PostgreSQL)', () => {
  const prefix = `ledger-currency-${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    await prisma.account.upsert({
      where: { code: '1100' },
      update: {},
      create: { id: ACCOUNT_A, code: '1100', name: 'Investor Cash Currency Test', type: AccountType.ASSET, normalBalance: Direction.DEBIT },
    });
    await prisma.account.upsert({
      where: { code: '2100' },
      update: {},
      create: { id: ACCOUNT_B, code: '2100', name: 'Customer Deposits Currency Test', type: AccountType.LIABILITY, normalBalance: Direction.CREDIT },
    });
  });

  afterAll(async () => prisma.$disconnect());

  it('allows a same-currency journal entry', async () => {
    const entry = await prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-same-currency`,
        reference: `${prefix}-same-currency-ref`,
        description: 'USD same-currency posting',
        currency: 'USD',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ACCOUNT_A, currency: 'USD', direction: Direction.DEBIT, amountKobo: 1000n },
            { accountId: ACCOUNT_B, currency: 'USD', direction: Direction.CREDIT, amountKobo: 1000n },
          ],
        },
      },
      include: { lines: true },
    });
    expect(entry.currency).toBe('USD');
    expect(entry.lines.every((line) => line.currency === 'USD')).toBe(true);
  });

  it('rejects a journal line whose currency differs from the parent entry', async () => {
    await expect(prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-mixed-line`,
        reference: `${prefix}-mixed-line-ref`,
        description: 'Mixed currency line must fail',
        currency: 'USD',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ACCOUNT_A, currency: 'USD', direction: Direction.DEBIT, amountKobo: 1000n },
            { accountId: ACCOUNT_B, currency: 'EUR', direction: Direction.CREDIT, amountKobo: 1000n },
          ],
        },
      },
    })).rejects.toThrow('JOURNAL_CURRENCY_MISMATCH');
  });

  it('rejects a reversal whose currency differs from the original entry', async () => {
    const original = await prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-reversal-original`,
        reference: `${prefix}-reversal-original-ref`,
        description: 'Original USD entry',
        currency: 'USD',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ACCOUNT_A, currency: 'USD', direction: Direction.DEBIT, amountKobo: 2000n },
            { accountId: ACCOUNT_B, currency: 'USD', direction: Direction.CREDIT, amountKobo: 2000n },
          ],
        },
      },
    });

    await expect(prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-reversal-mismatch`,
        reference: `${prefix}-reversal-mismatch-ref`,
        description: 'EUR reversal must fail',
        currency: 'EUR',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        reversalOfId: original.id,
        lines: {
          create: [
            { accountId: ACCOUNT_A, currency: 'EUR', direction: Direction.CREDIT, amountKobo: 2000n },
            { accountId: ACCOUNT_B, currency: 'EUR', direction: Direction.DEBIT, amountKobo: 2000n },
          ],
        },
      },
    })).rejects.toThrow('JOURNAL_REVERSAL_CURRENCY_MISMATCH');
  });

  it('isolates investor balances by currency and never aggregates USD with EUR', async () => {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}@example.com`,
        passwordHash: 'test-hash',
      },
    });

    await prisma.userLedgerAccount.createMany({
      data: [
        { userId: user.id, accountId: ACCOUNT_A, currency: 'USD' },
        { userId: user.id, accountId: ACCOUNT_A, currency: 'EUR' },
      ],
    });

    await prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-balance-usd`,
        reference: `${prefix}-balance-usd-ref`,
        description: 'Investor USD balance',
        currency: 'USD',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ACCOUNT_A, currency: 'USD', direction: Direction.DEBIT, amountKobo: 10000n, metadata: { investorId: user.id } },
            { accountId: ACCOUNT_B, currency: 'USD', direction: Direction.CREDIT, amountKobo: 10000n },
          ],
        },
      },
    });

    await prisma.journalEntry.create({
      data: {
        idempotencyKey: `${prefix}-balance-eur`,
        reference: `${prefix}-balance-eur-ref`,
        description: 'Investor EUR balance',
        currency: 'EUR',
        status: EntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: ACCOUNT_A, currency: 'EUR', direction: Direction.DEBIT, amountKobo: 25000n, metadata: { investorId: user.id } },
            { accountId: ACCOUNT_B, currency: 'EUR', direction: Direction.CREDIT, amountKobo: 25000n },
          ],
        },
      },
    });

    const service = new LedgerService(prisma as never);
    const usdBalance = await service.getMyBalance(user.id, 'usd');
    const eurBalance = await service.getMyBalance(user.id, 'EUR');

    expect(usdBalance).toEqual({ accountId: ACCOUNT_A, currency: 'USD', balanceKobo: '10000' });
    expect(eurBalance).toEqual({ accountId: ACCOUNT_A, currency: 'EUR', balanceKobo: '25000' });
    expect(usdBalance.balanceKobo).not.toBe('35000');
    expect(eurBalance.balanceKobo).not.toBe('35000');
  });
});
