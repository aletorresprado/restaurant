const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');

module.exports = async ({ base, db }) => {
  const email = `account-limit-${randomUUID()}@example.invalid`;
  const password = `Test1-${randomUUID()}`;
  let user;
  const login = (address, secret, web = false, ip = '192.0.2.1') => fetch(`${base}/auth/${web ? 'web/' : ''}login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip,
      ...(web ? { Origin: 'http://127.0.0.1:5173', 'X-Web-Session': randomUUID() } : {}) },
    body: JSON.stringify({ email: address, password: secret }),
  });
  try {
    user = await db.user.create({ data: { email, firstName: 'Account', lastName: 'Limit',
      passwordHash: await bcrypt.hash(password, 12) } });
    const session = await (await login(email, password)).json();
    assert.ok(session.accessToken);
    for (let i = 0; i < 5; i++) {
      const failed = await login(i % 2 ? email.toUpperCase() : email, 'Incorrect1', i % 2 === 0, `192.0.2.${i + 1}`);
      assert.equal(failed.status, 401);
    }
    const count = await db.session.count({ where: { userId: user.id } });
    for (const web of [false, true]) {
      const blocked = await login(email, password, web);
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
      assert.equal(blocked.headers.get('set-cookie'), null);
      const body = await blocked.json();
      assert.equal(body.code, 'RATE_LIMITED');
      assert.equal(body.user, undefined);
      assert.equal(body.accessToken, undefined);
    }
    assert.equal(await db.session.count({ where: { userId: user.id } }), count);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).isActive, true);
    assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${session.accessToken}` } })).status, 200);
    assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }) })).status, 200);
    const unknown = `absent-${email}`;
    for (let i = 0; i < 5; i++) assert.equal((await login(unknown, password)).status, 401);
    assert.equal((await login(unknown, password)).status, 429);
    console.log('OK: cinco fallos por correo compartidos entre web/Bearer, pausa temporal, cuentas inexistentes y sesiones vigentes intactas.');
  } finally {
    if (user) await db.user.deleteMany({ where: { id: user.id } });
  }
};
