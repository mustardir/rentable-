import { PrismaClient } from '@prisma/client';
import { computeAuditHash, type AuditEventInput } from '@fortress/audit-core';
import { PrismaAuditRepository } from '../src/audit/prisma-audit.repository';

const databaseUrl = process.env.DATABASE_URL;
const describePrisma = databaseUrl ? describe : describe.skip;

describePrisma('PrismaAuditRepository', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaAuditRepository(prisma as never);
  const prefix = `audit-repo-${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { entityId: { startsWith: prefix } },
    });
    await prisma.$disconnect();
  });

  const input = (entityType: string, entityId: string, eventType: string, payload: Record<string, unknown>): AuditEventInput => ({
    actorUserId: 'test-user',
    actorRole: 'ADMIN',
    eventType,
    entityType,
    entityId,
    payload,
    createdAt: new Date('2026-08-20T12:00:00.000Z'),
  });

  it('appends an event with a deterministic hash and no previous hash', async () => {
    const event = await repository.append(
      input('InvestorProfile', `${prefix}-one`, 'PROFILE_CREATED', { name: 'First Investor' }),
    );

    expect(event.previousHash).toBeNull();
    expect(event.hash).toBe(computeAuditHash(event));
    expect(event.actorUserId).toBe('test-user');
    expect(event.actorRole).toBe('ADMIN');
    expect(event.payload).toEqual({ name: 'First Investor' });
  });

  it('chains only the previous event for the same entity', async () => {
    const entityA = `${prefix}-entity-a`;
    const entityB = `${prefix}-entity-b`;

    const firstA = await repository.append(input('InvestorProfile', entityA, 'CREATED', { step: 1 }));
    const firstB = await repository.append(input('InvestorProfile', entityB, 'CREATED', { step: 1 }));
    const secondA = await repository.append(input('InvestorProfile', entityA, 'UPDATED', { step: 2 }));

    expect(firstA.previousHash).toBeNull();
    expect(firstB.previousHash).toBeNull();
    expect(secondA.previousHash).toBe(firstA.hash);
    expect(secondA.hash).toBe(computeAuditHash(secondA));
  });

  it('returns all events in global sequence order and filters by entity', async () => {
    const entityA = `${prefix}-list-a`;
    const entityB = `${prefix}-list-b`;

    const first = await repository.append(input('InvestorProfile', entityA, 'CREATED', { value: 1 }));
    const second = await repository.append(input('InvestorProfile', entityB, 'CREATED', { value: 2 }));
    const third = await repository.append(input('InvestorProfile', entityA, 'UPDATED', { value: 3 }));

    const all = await repository.all();
    const events = all.filter((event) => event.entityId === entityA || event.entityId === entityB);
    expect(events.map((event) => event.id)).toEqual([first.id, second.id, third.id]);
    expect(events[0].sequence < events[1].sequence).toBe(true);
    expect(events[1].sequence < events[2].sequence).toBe(true);

    const entityEvents = await repository.forEntity('InvestorProfile', entityA);
    expect(entityEvents.map((event) => event.id)).toEqual([first.id, third.id]);
  });

  it('rejects events missing required identity fields', async () => {
    await expect(
      repository.append({
        eventType: '',
        entityType: 'InvestorProfile',
        entityId: `${prefix}-invalid`,
        payload: {},
      }),
    ).rejects.toThrow('INVALID_AUDIT_EVENT');
  });
});
