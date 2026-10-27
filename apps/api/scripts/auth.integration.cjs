// Runs against a real migrated PostgreSQL database. Deletes only its own random test user.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { once } = require('node:events');
const { existsSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

process.chdir(path.resolve(__dirname, '..'));
if (existsSync('.env')) process.loadEnvFile('.env');

async function main() {
  const db = new PrismaClient();
  const email = `integration-${randomUUID()}@example.invalid`;
  let child;
  let userId;
  try {
    await db.$connect();
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    child = spawn(process.execPath, ['dist/main.js'], {
      cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'ignore', windowsHide: true,
    });
    const base = `http://127.0.0.1:${port}/api/v1`;
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw new Error('La API terminó antes de iniciar; revisar configuración y migraciones.');
      try { ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, 'La API no inició a tiempo');
    const request = async (route, body, token) => {
      const response = await fetch(`${base}/auth/${route}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
      return { status: response.status, body: await response.json() };
    };
    const registration = { firstName: 'Integration', lastName: 'Test', email, password: `Test1-${randomUUID()}`, role: 'ADMIN' };
    assert.equal((await request('register', { email: 'invalid' })).status, 400);
    const created = await request('register', registration);
    assert.equal(created.status, 201);
    userId = created.body.user.id;
    assert.equal(created.body.user.role, 'CUSTOMER');
    assert.equal(created.body.user.passwordHash, undefined);
    const persisted = await db.user.findUniqueOrThrow({ where: { id: userId } });
    assert.notEqual(persisted.passwordHash, registration.password);
    assert.equal((await request('register', registration)).status, 409);
    assert.equal((await request('login', { email, password: 'Incorrect1' })).status, 401);
    const login = await request('login', { email, password: registration.password });
    assert.equal(login.status, 200);
    assert.equal((await request('me')).status, 401);
    assert.equal((await request('me', undefined, login.body.accessToken)).body.id, userId);

    const session = await db.session.findUniqueOrThrow({ where: {
      refreshTokenHash: createHash('sha256').update(login.body.refreshToken).digest('hex'),
    } });
    assert.notEqual(session.refreshTokenHash, login.body.refreshToken);
    const refreshed = await request('refresh', { refreshToken: login.body.refreshToken });
    assert.equal(refreshed.status, 200);
    assert.equal((await request('refresh', { refreshToken: login.body.refreshToken })).status, 401);
    const concurrent = await Promise.all([
      request('refresh', { refreshToken: refreshed.body.refreshToken }),
      request('refresh', { refreshToken: refreshed.body.refreshToken }),
    ]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 401]);
    const winner = concurrent.find(r => r.status === 200);
    assert.equal((await request('logout', { refreshToken: winner.body.refreshToken })).status, 200);
    assert.equal((await request('refresh', { refreshToken: winner.body.refreshToken })).status, 401);
    await db.user.update({ where: { id: userId }, data: { isActive: false } });
    assert.equal((await request('me', undefined, created.body.accessToken)).status, 401);
    console.log('OK: registro, persistencia, login, perfil, rotación concurrente, logout y cuenta desactivada.');
  } finally {
    if (child && child.exitCode === null) {
      const closed = once(child, 'exit');
      child.kill();
      await closed;
    }
    // Exact random address prevents touching any existing account, including on a partial failure.
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
