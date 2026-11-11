const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
module.exports = async ({ base, db }) => {
  const suffix = randomUUID();
  const emails = ['admin', 'staff', 'customer', 'other-admin'].map(role => `managed-${role}-${suffix}@example.invalid`);
  const users = [];
  const branchIds = [];
  const request = async (method, path, body, token, key) => {
    const response = await fetch(`${base}${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    for (const [i, email] of emails.entries()) {
      const created = await request('POST', '/auth/register', { email, firstName: 'Managed', lastName: 'Temporal', password: `Test1-${suffix}` });
      assert.equal(created.status, 201);
      users.push(created.body);
      if (i !== 2) await db.user.update({ where: { email }, data: { role: i === 1 ? 'STAFF' : 'ADMIN' } });
    }
    const admin = users[0].accessToken, staff = users[1].accessToken;
    const branchBody = { name: `Managed ${suffix}`, address: 'Temporal 123' };
    const branchKey = randomUUID();
    assert.equal((await request('POST', '/admin/branches', branchBody, admin, 'invalid')).status, 400);
    assert.equal((await request('POST', '/admin/branches', branchBody, users[2].accessToken, branchKey)).status, 403);
    const branches = await Promise.all([branchKey, branchKey.toUpperCase(), branchKey].map(key => request('POST', '/admin/branches', branchBody, admin, key)));
    assert.ok(branches.every(r => r.status === 201));
    assert.equal(new Set(branches.map(r => r.body.id)).size, 1);
    const branch = branches[0].body;
    branchIds.push(branch.id);
    assert.equal(await db.branch.count({ where: { name: branchBody.name } }), 1);
    const other = await db.branch.create({ data: { name: `Other ${suffix}`, address: 'Temporal 456' } });
    branchIds.push(other.id);
    await db.branchStaff.create({ data: { branchId: branch.id, userId: users[1].user.id } });
    const root = `/staff/branches/${branch.id}`;
    const tableBody = { tableNumber: 'SAFE-1', capacity: 4 };
    const tableKey = randomUUID();
    const tables = await Promise.all([0, 1, 2].map(() => request('POST', `${root}/tables`, tableBody, admin, tableKey)));
    assert.ok(tables.every(r => r.status === 201));
    assert.equal(new Set(tables.map(r => r.body.id)).size, 1);
    const table = tables[0].body;
    assert.equal((await request('POST', `${root}/tables`, { ...tableBody, capacity: 5 }, admin, tableKey)).body.code, 'OPERATION_MISMATCH');
    assert.equal((await request('POST', `/staff/branches/${other.id}/tables`, tableBody, admin, tableKey)).status, 409);
    assert.equal((await request('POST', `${root}/tables`, tableBody, admin, branchKey)).status, 409);
    await request('PATCH', `${root}/tables/${table.id}`, { capacity: 6 }, admin);
    assert.equal((await request('POST', `${root}/tables`, tableBody, admin, tableKey)).body.capacity, 6);
    const date = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
    const cases = [
      [`${root}/schedules`, { dayOfWeek: 1, openingTime: '18:00', closingTime: '23:00' }],
      [`${root}/schedule-exceptions`, { date, openingTime: '18:00', closingTime: '23:00' }],
      [`${root}/tables/${table.id}/blocks`, { startAt: `${date}T21:00:00Z`, endAt: `${date}T22:00:00Z`, reason: 'Temporal protegido' }],
    ];
    for (const [path, body] of cases) {
      const key = randomUUID();
      const results = await Promise.all([0, 1, 2].map(() => request('POST', path, body, admin, key)));
      assert.ok(results.every(r => r.status === 201), JSON.stringify(results));
      assert.equal(new Set(results.map(r => r.body.id)).size, 1);
      const id = results[0].body.id;
      await request('DELETE', `${path}/${id}`, undefined, admin);
      assert.equal((await request('POST', path, body, admin, key)).status, 410);
    }
    const failedKey = randomUUID();
    assert.equal((await request('POST', `${root}/tables`, tableBody, admin, failedKey)).status, 409);
    assert.equal(await db.writeOperation.count({ where: { actorId: users[0].user.id, operationId: failedKey } }), 0);
    assert.equal((await request('POST', `${root}/tables`, { ...tableBody, tableNumber: 'SAFE-2' }, admin, failedKey)).status, 201);
    const staffBody = { ...tableBody, tableNumber: 'STAFF-1' };
    assert.equal((await request('POST', `${root}/tables`, staffBody, staff, tableKey)).status, 201);
    await db.branchStaff.deleteMany({ where: { branchId: branch.id, userId: users[1].user.id } });
    assert.equal((await request('POST', `${root}/tables`, staffBody, staff, tableKey)).status, 403);
    const points = { operationId: randomUUID(), points: 5, reason: 'Reconocimiento temporal' };
    const pointsPath = `/admin/users/${users[2].user.id}/loyalty/adjustments`;
    const first = await request('POST', pointsPath, points, admin);
    assert.equal(first.status, 200);
    // Simulate a historical uppercase key without rewriting audit data on replay.
    await db.loyaltyMovement.update({ where: { id: first.body.id }, data: { sourceKey: `adjustment:${users[2].user.id}:${points.operationId.toUpperCase()}` } });
    const replays = await Promise.all([points.operationId.toUpperCase(), points.operationId].map(id => request('POST', pointsPath, { ...points, operationId: id }, admin)));
    assert.ok(replays.every(r => r.status === 200 && r.body.id === first.body.id));
    assert.equal((await request('POST', pointsPath, points, users[3].accessToken)).status, 409);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: users[2].user.id } })).loyaltyBalance, 5);
    assert.equal(await db.loyaltyMovement.count({ where: { userId: users[2].user.id } }), 1);
    console.log('OK: altas idempotentes de sucursales/mesas/horarios/excepciones/bloqueos, borrados terminales, permisos y ajustes por autor sin duplicados.');
  } finally {
    await db.branch.deleteMany({ where: { id: { in: branchIds } } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
  }
};
