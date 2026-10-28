// Runs against real migrated PostgreSQL. Deletes only its own random users and branches.
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
  const adminEmail = `admin-${email}`;
  const branchNames = [`Integration A ${randomUUID()}`, `Integration B ${randomUUID()}`];
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

    const api = async (method, route, body, token) => {
      const response = await fetch(`${base}/${route}`, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
      });
      return { status: response.status, body: await response.json() };
    };
    // Fixture provisioning is limited to this random test account; production admins use db:seed.
    const administrator = await db.user.create({ data: {
      firstName: 'Integration', lastName: 'Admin', email: adminEmail, passwordHash: persisted.passwordHash, role: 'ADMIN',
    } });
    const adminLogin = await request('login', { email: adminEmail, password: registration.password });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.accessToken;
    const customerToken = created.body.accessToken;
    const branchData = { name: branchNames[0], address: 'Integration street 123' };
    assert.equal((await api('POST', 'admin/branches', branchData)).status, 401);
    assert.equal((await api('POST', 'admin/branches', branchData, customerToken)).status, 403);
    assert.equal((await api('GET', 'admin/users', undefined, customerToken)).status, 403);
    assert.equal((await api('POST', 'admin/branches', { ...branchData, latitude: -26 }, adminToken)).status, 400);
    const branch = await api('POST', 'admin/branches', branchData, adminToken);
    assert.equal(branch.status, 201);
    const branchId = branch.body.id;
    const otherBranch = await api('POST', 'admin/branches', { ...branchData, name: branchNames[1] }, adminToken);
    assert.equal(otherBranch.status, 201);
    assert.equal((await api('GET', `branches/${branchId}`)).status, 200);
    assert.equal((await api('GET', 'branches?page=0')).status, 400);
    assert.equal((await api('GET', 'branches/not-a-uuid')).status, 400);
    assert.equal((await api('GET', `branches/${randomUUID()}`)).status, 404);
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, {}, adminToken)).status, 400);
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, { unknown: true }, adminToken)).status, 400);
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, { latitude: -26 }, adminToken)).status, 400);
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, { latitude: -26, longitude: -65 }, adminToken)).status, 200);
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, { latitude: -27 }, adminToken)).status, 200);
    assert.equal((await api('PUT', `admin/branches/${branchId}/staff/${userId}`, undefined, adminToken)).status, 400);
    assert.equal((await api('PATCH', `admin/users/${userId}/role`, { role: 'ADMIN' }, adminToken)).status, 400);
    assert.equal((await api('PATCH', `admin/users/${administrator.id}/role`, { role: 'CUSTOMER' }, adminToken)).status, 403);
    assert.equal((await api('PATCH', `admin/users/${userId}/role`, { role: 'STAFF' }, adminToken)).status, 200);
    // The token was issued with CUSTOMER; current DB role must take effect without re-login.
    assert.deepEqual((await api('GET', 'staff/branches', undefined, customerToken)).body.data, []);
    assert.equal((await api('PUT', `admin/branches/${branchId}/staff/${userId}`, undefined, adminToken)).status, 200);
    assert.equal((await api('PUT', `admin/branches/${branchId}/staff/${userId}`, undefined, adminToken)).status, 200);
    assert.equal(await db.branchStaff.count({ where: { branchId, userId } }), 1);
    const assigned = await api('GET', 'staff/branches', undefined, customerToken);
    assert.equal(assigned.status, 200);
    assert.deepEqual(assigned.body.data.map(b => b.id), [branchId]);
    assert.equal((await api('GET', `staff/branches/${branchId}`, undefined, customerToken)).status, 200);
    assert.equal((await api('GET', `staff/branches/${otherBranch.body.id}`, undefined, customerToken)).status, 403);
    await require('./operations.integration.cjs')({ api, db, branchId, otherBranchId: otherBranch.body.id, adminToken, staffToken: customerToken });
    await require('./reservations.integration.cjs')({ api, db, branchId, otherBranchId: otherBranch.body.id, adminToken, staffToken: customerToken });
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, { name: 'Forbidden change' }, customerToken)).status, 403);
    assert.equal((await api('GET', `admin/branches/${branchId}/staff`, undefined, customerToken)).status, 403);
    const staff = await api('GET', `admin/branches/${branchId}/staff`, undefined, adminToken);
    assert.equal(staff.status, 200);
    assert.equal(staff.body[0].user.id, userId);
    assert.equal(JSON.stringify(staff.body).includes('passwordHash'), false);
    assert.equal((await api('GET', 'admin/users', undefined, adminToken)).status, 200);
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, { isActive: false }, adminToken)).status, 200);
    assert.equal((await api('GET', `branches/${branchId}`)).status, 404);
    assert.equal((await api('GET', `staff/branches/${branchId}`, undefined, customerToken)).status, 404);
    assert.deepEqual((await api('GET', 'staff/branches', undefined, customerToken)).body.data, []);
    assert.equal((await api('GET', `admin/branches/${branchId}`, undefined, adminToken)).body.isActive, false);
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, { isActive: true }, adminToken)).status, 200);
    assert.equal((await api('DELETE', `admin/branches/${branchId}/staff/${userId}`, undefined, adminToken)).status, 200);
    assert.equal((await api('GET', `staff/branches/${branchId}`, undefined, customerToken)).status, 403);
    assert.equal((await api('PUT', `admin/branches/${branchId}/staff/${userId}`, undefined, adminToken)).status, 200);
    const [demotion, assignment] = await Promise.all([
      api('PATCH', `admin/users/${userId}/role`, { role: 'CUSTOMER' }, adminToken),
      api('PUT', `admin/branches/${branchId}/staff/${userId}`, undefined, adminToken),
    ]);
    assert.equal(demotion.status, 200);
    assert.ok([200, 400].includes(assignment.status));
    assert.equal(await db.branchStaff.count({ where: { userId } }), 0);
    assert.equal((await api('GET', 'staff/branches', undefined, customerToken)).status, 403);
    console.log('OK: sucursales persistidas, roles actuales, asignaciones, aislamiento, validación y desactivación.');
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
    await db.branch.deleteMany({ where: { name: { in: branchNames } } });
    await db.user.deleteMany({ where: { email: { in: [email, adminEmail] } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
