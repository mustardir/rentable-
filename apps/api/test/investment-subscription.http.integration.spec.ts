import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Investment subscription HTTP validation integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let token: string;

  const password = 'Fortress-Test-Password-2026!';
  const dbAvailable = Boolean(process.env.DATABASE_URL);

  beforeAll(async () => {
    if (!dbAvailable) return;

    process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-access-secret';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'integration-test-refresh-secret';

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication(new ExpressAdapter());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const user = await prisma.user.create({
      data: {
        email: `investment-validation-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash(password, 4),
        role: UserRole.INVESTOR,
        isActive: true,
      },
    });
    userId = user.id;

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password })
      .expect(201);

    token = response.body.accessToken as string;
  });

  afterAll(async () => {
    if (!dbAvailable || !prisma) return;

    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('rejects a malformed subscription amount at the HTTP boundary', async () => {
    if (!dbAvailable) return;

    await request(app.getHttpServer())
      .post('/api/investor/investments/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: 'product-1',
        amountMinor: '50.00',
        currency: 'USD',
        idempotencyKey: 'http-validation-amount',
      })
      .expect(400);
  });

  it('rejects unknown subscription request fields at the HTTP boundary', async () => {
    if (!dbAvailable) return;

    await request(app.getHttpServer())
      .post('/api/investor/investments/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: 'product-1',
        amountMinor: '5000',
        currency: 'USD',
        idempotencyKey: 'http-validation-extra-field',
        unexpectedField: 'must-be-rejected',
      })
      .expect(400);
  });

  it('rejects an invalid redemption request before reaching the service', async () => {
    if (!dbAvailable) return;

    await request(app.getHttpServer())
      .post('/api/investor/investments/subscriptions/subscription-1/redeem')
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: '' })
      .expect(400);
  });

  it('rejects unknown redemption request fields at the HTTP boundary', async () => {
    if (!dbAvailable) return;

    await request(app.getHttpServer())
      .post('/api/investor/investments/subscriptions/subscription-1/redeem')
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: 'http-validation-redeem',
        amountMinor: '5000',
      })
      .expect(400);
  });
});
