const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { ConfigService } = require('@nestjs/config');
const { AccountActionsService } = require('../dist/auth/account-actions.service');

module.exports = async ({ base, db }) => {
  const email = `account-actions-${randomUUID()}@example.invalid`;
  const password = `Initial1-${randomUUID()}`;
  let user;
  const send = (route, body, headers = {}) => fetch(`${base}/auth/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  async function links(page) {
    const directory = path.resolve('.local/integration-mail');
    const files = await readdir(directory).catch(() => []);
    const messages = await Promise.all(files.sort().map(file => readFile(path.join(directory, file), 'utf8').then(JSON.parse).catch(() => null)));
    return messages.filter(mail => mail?.to === email && mail.text.includes(`/${page}#token=`));
  }
  async function token(page, count = 1) {
    for (let i = 0; i < 50; i++) {
      const messages = await links(page);
      if (messages.length >= count) return messages.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('No se genero el correo local de prueba');
  }
  try {
    user = await db.user.create({ data: { email, firstName: 'Account', lastName: 'Actions', role: 'STAFF', loyaltyBalance: 7,
      passwordHash: await bcrypt.hash(password, 12) } });
    const brokenQueue = new AccountActionsService(db, new ConfigService(),
      { enqueue: async () => { throw new Error('fixture queue unavailable'); } }, {});
    await assert.rejects(brokenQueue.request(email, 'VERIFY_EMAIL'), /fixture queue unavailable/);
    assert.equal(await db.accountActionToken.count({ where: { userId: user.id } }), 0,
      'A failed enqueue must roll back its token');
    const login = await (await send('login', { email, password })).json();
    const tab = randomUUID();
    const web = await send('web/login', { email, password }, { Origin: 'http://127.0.0.1:5173', 'X-Web-Session': tab });
    const cookie = web.headers.get('set-cookie').split(';')[0];
    const unknown = await (await send('forgot-password', { email: `unknown-${email}` })).json();
    assert.deepEqual(await (await send('request-email-verification', { email })).json(), unknown);
    const verify = await token('verificar-correo');
    const delivered = await db.mailJob.findFirstOrThrow({ where: { userId: user.id, status: 'sent' } });
    assert.equal(delivered.payload, null, 'Delivered payload must be erased');
    const stored = await db.accountActionToken.findUniqueOrThrow({ where: { userId_purpose: { userId: user.id, purpose: 'VERIFY_EMAIL' } } });
    assert.equal(stored.tokenHash, createHash('sha256').update(verify).digest('hex'));
    assert.notEqual(stored.tokenHash, verify);
    await send('request-email-verification', { email });
    assert.equal((await links('verificar-correo')).length, 1, 'Cooldown prevents email flooding');
    assert.equal((await send('reset-password', { token: verify, password: 'AnotherPassword1', confirmPassword: 'AnotherPassword1' })).status, 400);
    const verified = await Promise.all([send('verify-email', { token: verify }), send('verify-email', { token: verify })]);
    assert.deepEqual(verified.map(r => r.status).sort(), [200, 400]);
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt);
    assert.deepEqual(await (await send('forgot-password', { email })).json(), unknown);
    const expired = await token('restablecer');
    await db.accountActionToken.update({ where: { userId_purpose: { userId: user.id, purpose: 'RESET_PASSWORD' } },
      data: { expiresAt: new Date(0), createdAt: new Date(Date.now() - 61000) } });
    assert.equal((await send('reset-password', { token: expired, password: 'NewPassword1', confirmPassword: 'NewPassword1' })).status, 400);
    await send('forgot-password', { email });
    const reset = await token('restablecer', 2);
    assert.notEqual(reset, expired);
    assert.equal((await send('reset-password', { token: reset, password: 'NewPassword1', confirmPassword: 'Mismatch1' })).status, 400);
    const results = await Promise.all([
      send('reset-password', { token: reset, password: 'NewPassword1', confirmPassword: 'NewPassword1' }),
      send('reset-password', { token: reset, password: 'OtherPassword1', confirmPassword: 'OtherPassword1' }),
      send('login', { email, password }),
      send('refresh', { refreshToken: login.refreshToken }),
    ]);
    assert.deepEqual(results.slice(0, 2).map(r => r.status).sort(), [200, 400]);
    const current = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(current.authVersion, 1);
    assert.equal(current.loyaltyBalance, 7);
    assert.equal(current.role, 'STAFF');
    assert.equal(current.isActive, true);
    const profile = token => fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await profile(login.accessToken)).status, 401);
    for (const response of results.slice(2)) if (response.status === 200) {
      const credentials = await response.json();
      assert.equal((await profile(credentials.accessToken)).status, 401, 'Concurrent old credentials cannot survive reset');
    }
    assert.equal((await fetch(`${base}/auth/me`, { headers: { Cookie: cookie, 'X-Web-Session': tab } })).status, 401);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
    assert.equal((await send('refresh', { refreshToken: login.refreshToken })).status, 401);
    assert.equal((await send('reset-password', { token: reset, password: 'NewPassword1', confirmPassword: 'NewPassword1' })).status, 400);
    const winner = await bcrypt.compare('NewPassword1', current.passwordHash) ? 'NewPassword1' : 'OtherPassword1';
    assert.equal((await send('login', { email, password })).status, 401);
    assert.equal((await send('login', { email, password: winner })).status, 200);
    console.log('OK: correo local, hash/expiracion/proposito de enlaces, consumo unico concurrente, verificacion y reset con revocacion de cookies/JWT/refresh.');
  } finally {
    if (user) await db.user.deleteMany({ where: { id: user.id } });
  }
};
