import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { AppController } from './app.controller';
import { HealthService } from './health.service';
import { PrismaService } from './database/prisma.service';

describe('health HTTP contracts', () => {
  let app: INestApplication, base: string;
  const query = jest.fn<() => Promise<unknown[]>>().mockRejectedValue(new Error('private connection string'));
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AppController], providers: [HealthService,
      { provide: PrismaService, useValue: { $queryRaw: query } }] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/health`;
  });
  afterAll(async () => { await app?.close(); });
  it('keeps liveness independent from the database and returns 503 for failed readiness without internals', async () => {
    expect((await fetch(base)).status).toBe(200);
    expect(query).not.toHaveBeenCalled();
    const response = await fetch(`${base}/ready`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'error', service: 'App Resto API', checks: { database: 'down' } });
  });
});
