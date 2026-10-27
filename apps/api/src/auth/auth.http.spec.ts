import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AuthModule } from './auth.module';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';

describe('authentication HTTP contracts (simulated database)', () => {
  let app: INestApplication;
  let base: string;
  let storedUser: any;
  const db = {
    user: {
      create: async ({ data }: any) => (storedUser = {
        ...data, id: 'd9a2a8bc-e630-4cb8-97c3-4a17a1b61592', role: 'CUSTOMER', isActive: true,
      }),
      findUnique: async ({ where }: any) => storedUser &&
        (where.id === storedUser.id || where.email === storedUser.email) ? storedUser : null,
    },
    session: { create: async () => ({}), deleteMany: async () => ({ count: 1 }) },
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true, load: [() => ({
        JWT_ACCESS_SECRET: 'test-only-secret-with-at-least-32-characters',
        JWT_ACCESS_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d',
      })] }), DatabaseModule, AuthModule,
    ] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/auth`;
  });
  afterAll(async () => { await app?.close(); });
  const post = (path: string, body: unknown) => fetch(`${base}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  it('rejects invalid input before writing a user', async () => {
    const response = await post('register', { email: 'invalid', password: 'weak' });
    expect(response.status).toBe(400);
    expect(storedUser).toBeUndefined();
  });

  it('creates a customer, hashes the password and protects the profile', async () => {
    const response = await post('register', {
      firstName: ' Ana ', lastName: 'Perez', email: 'ANA@example.com', password: 'Password123', role: 'ADMIN',
    });
    expect(response.status).toBe(201);
    const body: any = await response.json();
    expect(body.user.email).toBe('ana@example.com');
    expect(body.user.firstName).toBe('Ana');
    expect(body.user.role).toBe('CUSTOMER');
    expect(storedUser.passwordHash).not.toBe('Password123');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect((await fetch(`${base}/me`)).status).toBe(401);
    const profile = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${body.accessToken}` } });
    expect(profile.status).toBe(200);
    expect((await profile.json() as any).id).toBe(body.user.id);
  });

  it('authenticates the stored hash and rejects incorrect credentials', async () => {
    expect((await post('login', { email: 'ana@example.com', password: 'WrongPassword1' })).status).toBe(401);
    const response = await post('login', { email: 'ANA@example.com', password: 'Password123' });
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.accessToken).toEqual(expect.any(String));
    storedUser.isActive = false;
    expect((await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${body.accessToken}` } })).status).toBe(401);
  });
});
