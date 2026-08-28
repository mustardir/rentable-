import { InvestorService } from '../src/investor/investor.service';

const profile = {
  id: 'profile-1',
  firstName: 'Ada',
  lastName: 'Investor',
  phone: null,
  dateOfBirth: null,
  country: 'NG',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function createService(users: Record<string, unknown>) {
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(users[where.id] ?? null)),
    },
  } as any;
  return { service: new InvestorService(prisma), findUnique: prisma.user.findUnique };
}

describe('InvestorService', () => {
  it('loads the profile belonging to the authenticated user id', async () => {
    const user = {
      id: 'user-1',
      email: 'investor@example.com',
      role: 'USER',
      isActive: true,
      createdAt: new Date('2026-01-01'),
      profile,
    };
    const { service, findUnique } = createService({ 'user-1': user });

    const result = await service.getProfileForUser('user-1');

    expect(findUnique.mock.calls[0][0].where).toEqual({ id: 'user-1' });
    expect(result).toEqual(user);
  });

  it('cannot return another investor when a different user id is requested', async () => {
    const otherUser = {
      id: 'user-2',
      email: 'other@example.com',
      role: 'USER',
      isActive: true,
      createdAt: new Date(),
      profile: { ...profile, id: 'profile-2', firstName: 'Other' },
    };
    const { service, findUnique } = createService({ 'user-2': otherUser });

    await expect(service.getProfileForUser('user-1')).rejects.toThrow('Investor not found');
    expect(findUnique.mock.calls[0][0].where).toEqual({ id: 'user-1' });
  });

  it('rejects inactive users', async () => {
    const inactiveUser = {
      id: 'user-1',
      email: 'inactive@example.com',
      role: 'USER',
      isActive: false,
      createdAt: new Date(),
      profile: null,
    };
    const { service } = createService({ 'user-1': inactiveUser });

    await expect(service.getProfileForUser('user-1')).rejects.toThrow('Investor not found');
  });
});
