import { InvestorService } from '../src/investor/investor.service';

function createService(user: unknown) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
    },
  } as any;
  return { service: new InvestorService(prisma), findUnique: prisma.user.findUnique };
}

describe('InvestorService', () => {
  it('loads only the profile belonging to the authenticated user id', async () => {
    const user = {
      id: 'user-1',
      email: 'investor@example.com',
      role: 'USER',
      isActive: true,
      createdAt: new Date('2026-01-01'),
      profile: { id: 'profile-1', firstName: 'Ada', lastName: 'Investor' },
    };
    const { service, findUnique } = createService(user);

    const result = await service.getProfileForUser('user-1');

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            dateOfBirth: true,
            country: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    expect(result).toEqual(user);
  });

  it('does not expose another investor profile by id', async () => {
    const { service, findUnique } = createService({
      id: 'user-2',
      email: 'other@example.com',
      role: 'USER',
      isActive: true,
      createdAt: new Date(),
      profile: { id: 'profile-2', firstName: 'Other' },
    });

    const result = await service.getProfileForUser('user-1');

    expect(findUnique.mock.calls[0][0].where).toEqual({ id: 'user-1' });
    expect(result.id).toBe('user-2');
  });

  it('rejects inactive users', async () => {
    const { service } = createService({
      id: 'user-1',
      email: 'inactive@example.com',
      role: 'USER',
      isActive: false,
      createdAt: new Date(),
      profile: null,
    });

    await expect(service.getProfileForUser('user-1')).rejects.toThrow('Investor not found');
  });
});
