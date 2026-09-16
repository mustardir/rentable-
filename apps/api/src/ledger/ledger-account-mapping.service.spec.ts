import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { LedgerAccountMappingService } from './ledger-account-mapping.service';

describe('LedgerAccountMappingService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    account: { findUnique: jest.fn() },
    userLedgerAccount: { create: jest.fn() },
  } as any;

  const service = new LedgerAccountMappingService(prisma);

  beforeEach(() => jest.clearAllMocks());

  const validInput = {
    actorId: 'admin-1',
    userId: 'investor-1',
    accountId: 'acct-1100',
    currency: 'usd',
  };

  it('provisions an explicit normalized currency mapping for an investor', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'admin-1', isActive: true, role: UserRole.SUPER_ADMIN })
      .mockResolvedValueOnce({ id: 'investor-1', isActive: true, role: UserRole.INVESTOR });
    prisma.account.findUnique.mockResolvedValue({ id: 'acct-1100', isActive: true });
    prisma.userLedgerAccount.create.mockResolvedValue({
      id: 'mapping-1',
      userId: 'investor-1',
      accountId: 'acct-1100',
      currency: 'USD',
      isActive: true,
    });

    await expect(service.provision(validInput)).resolves.toMatchObject({
      id: 'mapping-1',
      currency: 'USD',
      isActive: true,
    });

    expect(prisma.userLedgerAccount.create).toHaveBeenCalledWith({
      data: {
        userId: 'investor-1',
        accountId: 'acct-1100',
        currency: 'USD',
        isActive: true,
      },
    });
  });

  it('allows a compliance officer to provision a mapping', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'compliance-1', isActive: true, role: UserRole.COMPLIANCE_OFFICER })
      .mockResolvedValueOnce({ id: 'investor-1', isActive: true, role: UserRole.INVESTOR });
    prisma.account.findUnique.mockResolvedValue({ id: 'acct-1100', isActive: true });
    prisma.userLedgerAccount.create.mockResolvedValue({ id: 'mapping-1', currency: 'EUR' });

    await expect(service.provision({ ...validInput, actorId: 'compliance-1', currency: ' eur ' })).resolves.toMatchObject({
      id: 'mapping-1',
      currency: 'EUR',
    });
  });

  it('rejects an unauthorized provisioning actor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'investor-1', isActive: true, role: UserRole.INVESTOR });

    await expect(service.provision(validInput)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userLedgerAccount.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive provisioning actor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: false, role: UserRole.SUPER_ADMIN });

    await expect(service.provision(validInput)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userLedgerAccount.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive or missing investor', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'admin-1', isActive: true, role: UserRole.SUPER_ADMIN })
      .mockResolvedValueOnce(null);

    await expect(service.provision(validInput)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.userLedgerAccount.create).not.toHaveBeenCalled();
  });

  it('rejects non-investor targets', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'admin-1', isActive: true, role: UserRole.SUPER_ADMIN })
      .mockResolvedValueOnce({ id: 'manager-1', isActive: true, role: UserRole.PORTFOLIO_MANAGER });

    await expect(service.provision({ ...validInput, userId: 'manager-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userLedgerAccount.create).not.toHaveBeenCalled();
  });

  it('rejects missing or inactive ledger accounts', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'admin-1', isActive: true, role: UserRole.SUPER_ADMIN })
      .mockResolvedValueOnce({ id: 'investor-1', isActive: true, role: UserRole.INVESTOR });
    prisma.account.findUnique.mockResolvedValue(null);

    await expect(service.provision(validInput)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.userLedgerAccount.create).not.toHaveBeenCalled();
  });

  it('rejects invalid currency before provisioning', async () => {
    await expect(service.provision({ ...validInput, currency: 'USDX' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.userLedgerAccount.create).not.toHaveBeenCalled();
  });

  it('translates a unique constraint race into a domain conflict', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'admin-1', isActive: true, role: UserRole.SUPER_ADMIN })
      .mockResolvedValueOnce({ id: 'investor-1', isActive: true, role: UserRole.INVESTOR });
    prisma.account.findUnique.mockResolvedValue({ id: 'acct-1100', isActive: true });
    prisma.userLedgerAccount.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      }),
    );

    await expect(service.provision(validInput)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.provision(validInput)).rejects.toMatchObject({ message: 'LEDGER_MAPPING_ALREADY_EXISTS' });
  });
});
