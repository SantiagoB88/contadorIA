import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

// The HTTP layer is exercised here without a real database: PrismaService is
// replaced with a stub so the suite runs in CI without Postgres.
const prismaStub = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  isReachable: jest.fn().mockResolvedValue(true),
};

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns an ok snapshot', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'dashgobo-api',
      checks: { database: 'ok' },
    });
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('unknown routes return the canonical error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBeDefined();
  });
});
