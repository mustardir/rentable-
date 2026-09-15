import { BadRequestException } from '@nestjs/common';
import { TransactionType, UserRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { WalletService } from '../src/wallet/wallet.service';

describe('WalletService idempotency concurrency', () => {
  let prisma: PrismaService;
  let service: WalletService;
  let investorId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new WalletService(prisma, { append: jest.fn() } as any);
    const investor = await prisma.user.findFirst({ where: { role: UserRole.INVESTOR, isActive: true }, select: { id: true } });
    if (!investor) throw new Error('No active investor fixture available');
    investorId = investor.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('returns the same transaction for simultaneous identical requests', async () => {
    const idempotencyKey = `wallet-idem-concurrency-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dto = { amountKobo: '10000', currency: 'USD', idempotencyKey, reference: `IDEM-${idempotencyKey}` };
    const originalFindUnique = prisma.transaction.findUnique.bind(prisma.transaction);
    let firstReadCount = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    let readCount = 0;
    let releaseBothReads!: () => void;
    const bothReads = new Promise<void>((resolve) => { releaseBothReads = resolve; });

    const findUniqueSpy = jest.spyOn(prisma.transaction, 'findUnique').mockImplementation((async (args: any) => {
      const result = await originalFindUnique(args);
      if (args?.where?.idempotencyKey === idempotencyKey && firstReadCount < 2) {
        firstReadCount += 1;
        readCount += 1;
        if (readCount === 2) releaseBothReads();
        await bothReads;
      }
      return result;
    }) as any);

    const releaseTask = bothReads.then(() => release());
    const results = await Promise.all([
      service.createDepositRequest(investorId, dto),
      service.createDepositRequest(investorId, dto),
      releaseTask.then(() => undefined),
    ]);
    findUniqueSpy.mockRestore();

    const transactions = await prisma.transaction.findMany({ where: { idempotencyKey }, select: { id: true, userId: true, type: true, amountKobo: true, currency: true, reference: true } });
    expect(transactions).toHaveLength(1);
    expect(results[0].id).toBe(results[1].id);
    expect(transactions[0]).toMatchObject({ userId: investorId, type: TransactionType.DEPOSIT, amountKobo: 10000n, currency: 'USD', reference: dto.reference });
  });

  it('rejects a conflicting replay instead of creating a second transaction', async () => {
    const idempotencyKey = `wallet-idem-conflict-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const first = { amountKobo: '10000', currency: 'USD', idempotencyKey, reference: `CONFLICT-${idempotencyKey}` };
    const second = { ...first, amountKobo: '20000' };
    const created = await service.createDepositRequest(investorId, first);
    await expect(service.createDepositRequest(investorId, second)).rejects.toThrow(BadRequestException);
    const transactions = await prisma.transaction.findMany({ where: { idempotencyKey }, select: { id: true, amountKobo: true } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual({ id: created.id, amountKobo: 10000n });
  });
});
