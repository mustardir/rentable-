import { UserRole } from '@prisma/client';
import { WalletService } from '../src/wallet/wallet.service';

describe('WalletService investor authorization', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    transaction: { findUnique: jest.fn(), create: jest.fn() },
  } as any;
  const audit = { append: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.transaction.findUnique.mockResolvedValue(null);
    prisma.transaction.create.mockResolvedValue({ id: 'tx-1', status: 'PENDING' });
  });

  it('allows an active investor to create a deposit request', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'investor-1', isActive: true, role: UserRole.INVESTOR });

    const result = await new WalletService(prisma, audit).createDepositRequest('investor-1', {
      amountKobo: '1000',
      idempotencyKey: 'dep-investor-1',
      currency: 'USD',
    });

    expect(result).toMatchObject({ id: 'tx-1', status: 'PENDING' });
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    UserRole.PORTFOLIO_MANAGER,
    UserRole.TREASURY_MANAGER,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SUPER_ADMIN,
  ])('rejects %s from creating wallet requests', async (role) => {
    prisma.user.findUnique.mockResolvedValue({ id: 'operator-1', isActive: true, role });

    await expect(new WalletService(prisma, audit).createWithdrawalRequest('operator-1', {
      amountKobo: '1000',
      idempotencyKey: `wdr-${role}`,
      currency: 'USD',
    })).rejects.toThrow('Only investors can create wallet requests');

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
