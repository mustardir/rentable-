import { ForbiddenException } from '@nestjs/common';
import { TransactionType, UserRole } from '@prisma/client';
import { WalletController } from './wallet.controller';

describe('WalletController admin request authorization', () => {
  const walletService = {
    forbiddenOperator: jest.fn(() => { throw new ForbiddenException('Only an active admin or compliance user can access wallet approvals'); }),
    getOperatorRequests: jest.fn().mockResolvedValue([]),
  } as any;
  const prisma = {
    transaction: { findMany: jest.fn() },
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it.each([UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER])('allows %s to list pending wallet requests', async (role) => {
    const controller = new WalletController(walletService, prisma);
    const result = await controller.getAdminRequests({ user: { id: 'operator-1', email: 'operator@example.com', role } } as any, '25');

    expect(result).toEqual([]);
    expect(walletService.getOperatorRequests).toHaveBeenCalledWith(25);
    expect(walletService.forbiddenOperator).not.toHaveBeenCalled();
  });

  it.each([UserRole.INVESTOR, UserRole.PORTFOLIO_MANAGER, UserRole.TREASURY_MANAGER])('rejects %s from listing pending wallet requests', async (role) => {
    const controller = new WalletController(walletService, prisma);

    await expect(controller.getAdminRequests({ user: { id: 'user-1', email: 'user@example.com', role } } as any)).rejects.toThrow(ForbiddenException);
    expect(walletService.getOperatorRequests).not.toHaveBeenCalled();
  });

  it('does not treat legacy ADMIN or COMPLIANCE role strings as valid Prisma roles', async () => {
    const controller = new WalletController(walletService, prisma);

    await expect(controller.getAdminRequests({ user: { id: 'legacy-1', email: 'legacy@example.com', role: 'ADMIN' } } as any)).rejects.toThrow(ForbiddenException);
    await expect(controller.getAdminRequests({ user: { id: 'legacy-2', email: 'legacy@example.com', role: 'COMPLIANCE' } } as any)).rejects.toThrow(ForbiddenException);
  });
});
