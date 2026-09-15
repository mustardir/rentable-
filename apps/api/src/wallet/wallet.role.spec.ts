import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { WalletService } from './wallet.service';

describe('WalletService investor request authorization', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    transaction: { findUnique: jest.fn(), create: jest.fn() },
  } as any;
  const audit = { append: jest.fn() } as any;

  beforeEach(() => jest.clearAllMocks());

  it('allows an investor to create a deposit request', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'investor-1', isActive: true, role: UserRole.INVESTOR });
    prisma.transaction.findUnique.mockResolvedValue(null);
    prisma.transaction.create.mockResolvedValue({ id: 'tx-1', status: 'PENDING' });

    await expect(new WalletService(prisma, audit).createDepositRequest('investor-1', {
      amountKobo: '1000',
      idempotencyKey: 'dep-investor-1',
      currency: 'USD',
    })).resolves.toMatchObject({ id: 'tx-1', status: 'PENDING' });
  });

  it('rejects a portfolio manager from creating a deposit request', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'manager-1', isActive: true, role: UserRole.PORTFOLIO_MANAGER });

    await expect(new WalletService(prisma, audit).createDepositRequest('manager-1', {
      amountKobo: '1000',
      idempotencyKey: 'dep-manager-1',
      currency: 'USD',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects a compliance officer from creating a withdrawal request', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'compliance-1', isActive: true, role: UserRole.COMPLIANCE_OFFICER });

    await expect(new WalletService(prisma, audit).createWithdrawalRequest('compliance-1', {
      amountKobo: '1000',
      idempotencyKey: 'wdr-compliance-1',
      currency: 'USD',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
