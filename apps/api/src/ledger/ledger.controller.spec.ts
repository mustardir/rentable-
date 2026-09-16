import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LedgerController } from './ledger.controller';

describe('LedgerController mapping provisioning authorization', () => {
  const ledgerService = {
    getMyBalance: jest.fn(),
    getMyTransactions: jest.fn(),
  } as any;
  const mappingService = {
    provision: jest.fn().mockResolvedValue({ id: 'mapping-1', currency: 'USD' }),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it.each([UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER])('allows %s to provision a mapping', async (role) => {
    const controller = new LedgerController(ledgerService, mappingService);

    const result = await controller.provisionLedgerAccountMapping(
      { user: { id: 'operator-1', email: 'operator@example.com', role } } as any,
      { userId: 'investor-1', accountId: 'account-1', currency: ' usd ' },
    );

    expect(result).toEqual({ id: 'mapping-1', currency: 'USD' });
    expect(mappingService.provision).toHaveBeenCalledWith({
      actorId: 'operator-1',
      userId: 'investor-1',
      accountId: 'account-1',
      currency: ' usd ',
    });
  });

  it.each([UserRole.INVESTOR, UserRole.PORTFOLIO_MANAGER, UserRole.TREASURY_MANAGER])('rejects %s from provisioning a mapping', async (role) => {
    const controller = new LedgerController(ledgerService, mappingService);

    await expect(
      controller.provisionLedgerAccountMapping(
        { user: { id: 'user-1', email: 'user@example.com', role } } as any,
        { userId: 'investor-1', accountId: 'account-1', currency: 'USD' },
      ),
    ).rejects.toThrow(new ForbiddenException('PROVISIONING_ACTOR_NOT_AUTHORIZED'));

    expect(mappingService.provision).not.toHaveBeenCalled();
  });

  it('rejects legacy role strings at the controller boundary', async () => {
    const controller = new LedgerController(ledgerService, mappingService);

    for (const role of ['ADMIN', 'COMPLIANCE']) {
      await expect(
        controller.provisionLedgerAccountMapping(
          { user: { id: 'legacy-1', email: 'legacy@example.com', role } } as any,
          { userId: 'investor-1', accountId: 'account-1', currency: 'USD' },
        ),
      ).rejects.toThrow(ForbiddenException);
    }

    expect(mappingService.provision).not.toHaveBeenCalled();
  });
});
