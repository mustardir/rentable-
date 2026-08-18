import { AccountType, Direction, PrismaClient, Role, KYCLevel, KYCStatus } from '@prisma/client';
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


  const accounts = [
    { id: 'acct_1000', code: '1000', name: 'Assets', type: AccountType.ASSET, normalBalance: Direction.DEBIT, description: 'Top-level asset category' },
    { id: 'acct_1100', code: '1100', name: 'Investor Cash', type: AccountType.ASSET, normalBalance: Direction.DEBIT, description: 'Cash held on behalf of investors; funded by inbound deposits' },
    { id: 'acct_1200', code: '1200', name: 'Settlement Account', type: AccountType.ASSET, normalBalance: Direction.DEBIT, description: 'Funds in transit during payment settlement' },
    { id: 'acct_2000', code: '2000', name: 'Liabilities', type: AccountType.LIABILITY, normalBalance: Direction.CREDIT, description: 'Top-level liability category' },
    { id: 'acct_2100', code: '2100', name: 'Customer Deposits', type: AccountType.LIABILITY, normalBalance: Direction.CREDIT, description: 'Investor cash balances held in custody' },
    { id: 'acct_2200', code: '2200', name: 'Product Obligations', type: AccountType.LIABILITY, normalBalance: Direction.CREDIT, description: 'Capital committed to active investment products' },
    { id: 'acct_3000', code: '3000', name: 'Equity', type: AccountType.EQUITY, normalBalance: Direction.CREDIT, description: 'Top-level equity category' },
    { id: 'acct_4000', code: '4000', name: 'Revenue', type: AccountType.REVENUE, normalBalance: Direction.CREDIT, description: 'Top-level revenue category' },
    { id: 'acct_5000', code: '5000', name: 'Expenses', type: AccountType.EXPENSE, normalBalance: Direction.DEBIT, description: 'Top-level expense category' },
  ];

  for (const account of accounts) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: {
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        metadata: { description: account.description, source: 'chart-of-accounts-v1' },
      },
      create: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        metadata: { description: account.description, source: 'chart-of-accounts-v1' },
      },
    });
  }

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
