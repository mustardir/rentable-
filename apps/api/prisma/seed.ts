import { PrismaClient, Role, KYCLevel, KYCStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@fortress-fund.com';
  const complianceEmail = 'compliance@fortress-fund.com';
  const userEmail = 'user@fortress-fund.com';

  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      profile: {
        create: {
          firstName: 'Fortress',
          lastName: 'Admin',
          country: 'US',
        },
      },
    },
  });

  const compliance = await prisma.user.upsert({
    where: { email: complianceEmail },
    update: {},
    create: {
      email: complianceEmail,
      passwordHash,
      role: Role.COMPLIANCE,
      profile: {
        create: {
          firstName: 'Fortress',
          lastName: 'Compliance',
          country: 'US',
        },
      },
    },
  });

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      email: userEmail,
      passwordHash,
      role: Role.USER,
      profile: {
        create: {
          firstName: 'Demo',
          lastName: 'User',
          country: 'US',
        },
      },
    },
  });

  await prisma.kYCRecord.createMany({
    data: [
      {
        userId: user.id,
        status: KYCStatus.PENDING,
        level: KYCLevel.TIER_0,
        documentType: 'PASSPORT',
        metadata: {
          source: 'seed',
          submittedBy: userEmail,
        },
      },
      {
        userId: compliance.id,
        status: KYCStatus.APPROVED,
        level: KYCLevel.TIER_2,
        documentType: 'NATIONAL_ID',
        reviewedAt: new Date(),
        reviewNotes: 'Seed compliance profile approved',
        metadata: {
          source: 'seed',
          reviewedBy: adminEmail,
        },
      },
    ],
    skipDuplicates: true,
  });

  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        action: 'SEED_ADMIN_USER_CREATED',
        entityType: 'User',
        entityId: admin.id,
        metadata: { email: adminEmail },
      },
      {
        userId: compliance.id,
        action: 'SEED_COMPLIANCE_USER_CREATED',
        entityType: 'User',
        entityId: compliance.id,
        metadata: { email: complianceEmail },
      },
      {
        userId: user.id,
        action: 'SEED_STANDARD_USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        metadata: { email: userEmail },
      },
    ],
    skipDuplicates: false,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
