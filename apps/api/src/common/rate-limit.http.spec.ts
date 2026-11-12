import { Controller, Get, MiddlewareConsumer, Module, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { RateLimitMiddleware } from './rate-limit';

let writes = 0;
@Controller()
class Routes {
  @Post('auth/login') login() { writes++; return { ok: true }; }
  @Post('auth/web/login') webLogin() { writes++; return { ok: true }; }
  @Post('reservations') reserve() { writes++; return { ok: true }; }
  @Post('admin/branches') branch() { writes++; return { ok: true }; }
  @Post('auth/web/logout') logout() { return { ok: true }; }
  @Get('health') health() { return { ok: true }; }
}
@Module({ imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({
  RATE_LIMIT_LOGIN: 2, RATE_LIMIT_WRITE: 2,
})] })], controllers: [Routes] })
class Fixture {
  configure(consumer: MiddlewareConsumer) { consumer.apply(RateLimitMiddleware).forRoutes('*'); }
}
describe('rate limiting before controller writes (real HTTP)', () => {
  let app: INestApplication, base: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [Fixture] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
  });
  afterAll(async () => { await app?.close(); });
  it('enforces shared groups and never calls a handler when returning 429', async () => {
    const post = (path: string) => fetch(base + path, { method: 'POST', headers: { 'X-Forwarded-For': '192.0.2.55' } });
    expect((await post('/auth/login')).status).toBe(201);
    expect((await post('/auth/web/login')).status).toBe(201);
    const blocked = await post('/auth/login');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(writes).toBe(2);
    expect((await post('/reservations')).status).toBe(201);
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => post('/admin/branches')));
    expect(concurrent.filter(response => response.status === 201)).toHaveLength(1);
    expect(concurrent.filter(response => response.status === 429)).toHaveLength(4);
    expect((await post('/reservations')).status).toBe(429);
    expect(writes).toBe(4);
    expect((await post('/auth/web/logout')).status).toBe(201);
    expect((await fetch(base + '/health')).status).toBe(200);
  });
});
