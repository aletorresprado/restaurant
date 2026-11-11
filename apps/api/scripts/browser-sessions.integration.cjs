const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');

module.exports = async ({ base, db }) => {
  const email = `cookie-${randomUUID()}@example.invalid`;
  const password = `Test1-${randomUUID()}`;
  const origin = 'http://127.0.0.1:5173';
  const ids = [randomUUID(), randomUUID()];
  const send = (path, method = 'GET', body, headers = {}) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const registration = { email, password, firstName: 'Cookie', lastName: 'Temporal' };
    assert.equal((await send('/auth/web/register', 'POST', registration, { 'X-Web-Session': ids[0] })).status, 403);
    assert.equal((await send('/auth/web/register', 'POST', registration, { 'X-Web-Session': ids[0], Origin: 'https://evil.example' })).status, 403);
    const registered = await send('/auth/web/register', 'POST', registration, { 'X-Web-Session': ids[0], Origin: origin });
    assert.equal(registered.status, 201);
    const body = await registered.json();
    assert.deepEqual(Object.keys(body), ['user']);
    const setCookie = registered.headers.get('set-cookie');
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('SameSite=Strict'));
    assert.ok(!setCookie.includes('Domain=') && !setCookie.includes('Max-Age=') && !setCookie.includes('Expires='));
    assert.equal(registered.headers.get('cache-control'), 'no-store');
    const cookie = setCookie.split(';')[0];
    const headers = { 'X-Web-Session': ids[0], Cookie: cookie, Origin: origin };
    assert.equal((await send('/auth/me', 'GET', undefined, headers)).status, 200);
    assert.equal((await send('/auth/me', 'GET', undefined, { Cookie: cookie })).status, 401);
    assert.equal((await send('/auth/me', 'GET', undefined, { ...headers, 'X-Web-Session': ids[1] })).status, 401);
    assert.equal((await send('/auth/me', 'GET', undefined, { ...headers, Cookie: `${cookie}; ${cookie}` })).status, 401);
    const secret = cookie.slice(cookie.indexOf('=') + 1);
    const row = await db.session.findUniqueOrThrow({ where: { refreshTokenHash: createHash('sha256').update(secret).digest('hex') } });
    assert.equal(row.browserTabId, ids[0]);
    assert.ok(row.expiresAt.getTime() > Date.now() + 7 * 3600000);
    // A browser cookie cannot be exchanged for JavaScript-readable JWTs.
    assert.equal((await send('/auth/refresh', 'POST', { refreshToken: secret })).status, 401);
    for (const changed of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }])
      assert.equal((await send('/auth/web/logout', 'POST', {}, { ...headers, ...changed })).status, 403);
    assert.equal((await send('/auth/web/logout', 'POST', {}, { Cookie: cookie, 'X-Web-Session': ids[0] })).status, 403);
    assert.equal((await send('/auth/me', 'GET', undefined, headers)).status, 200);
    const second = await send('/auth/web/login', 'POST', { email, password }, { 'X-Web-Session': ids[1], Origin: origin });
    assert.equal(second.status, 200);
    const secondCookie = second.headers.get('set-cookie').split(';')[0];
    const secondHeaders = { 'X-Web-Session': ids[1], Cookie: secondCookie, Origin: origin };
    await db.user.update({ where: { email }, data: { role: 'STAFF' } });
    assert.equal((await send('/auth/me', 'GET', undefined, headers).then(r => r.json())).role, 'STAFF');
    await db.user.update({ where: { email }, data: { isActive: false } });
    assert.equal((await send('/auth/me', 'GET', undefined, secondHeaders)).status, 401);
    await db.user.update({ where: { email }, data: { isActive: true } });
    assert.equal((await send('/auth/web/logout', 'POST', {}, headers)).status, 200);
    assert.equal((await send('/auth/me', 'GET', undefined, headers)).status, 401);
    assert.equal((await send('/auth/me', 'GET', undefined, secondHeaders)).status, 200);
    await db.session.updateMany({ where: { browserTabId: ids[1] }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await send('/auth/me', 'GET', undefined, secondHeaders)).status, 401);
    const legacy = await send('/auth/login', 'POST', { email, password }).then(r => r.json());
    assert.ok(legacy.accessToken && legacy.refreshToken);
    assert.equal((await send('/auth/me', 'GET', undefined, { Authorization: `Bearer ${legacy.accessToken}` })).status, 200);
    console.log('OK: cookies HttpOnly, CSRF/origen, aislamiento de pestañas, roles actuales, expiracion, revocacion inmediata y compatibilidad Bearer.');
  } finally { await db.user.deleteMany({ where: { email } }); }
};
