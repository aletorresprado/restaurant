const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

module.exports = async ({ api, db, base, adminToken, staffToken }) => {
  const branch = await db.branch.create({ data: { name: `Imagen temporal ${randomUUID()}`, address: 'Dirección temporal 123' } });
  const email = `image-customer-${randomUUID()}@example.invalid`;
  try {
    const customer = await api('POST', 'auth/register', { email, firstName: 'Imagen', lastName: 'Temporal', password: 'Password123' });
    assert.equal(customer.status, 201);
    const jpeg = readFileSync(path.resolve(__dirname, '../../web/src/assets/hero.jpg'));
    const upload = (data, mime = 'image/jpeg', token = adminToken) => {
      const body = new FormData(); body.append('file', new Blob([data], { type: mime }), 'imagen.jpg');
      return fetch(`${base}/admin/branches/${branch.id}/image`, { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    };
    const adminRead = token => fetch(`${base}/admin/branches/${branch.id}/image`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal((await fetch(`${base}/branches/${branch.id}/image`)).status, 404);
    assert.equal((await upload(jpeg, 'image/jpeg', null)).status, 401);
    assert.equal((await upload(jpeg, 'image/jpeg', staffToken)).status, 403);
    assert.equal((await upload(jpeg, 'image/jpeg', customer.body.accessToken)).status, 403);
    assert.equal((await upload(Buffer.from('<svg></svg>'), 'image/svg+xml')).status, 400);
    assert.equal((await upload(jpeg, 'image/png')).status, 400);
    assert.equal((await upload(Buffer.alloc(2097153), 'image/jpeg')).status, 413);
    const created = await upload(jpeg);
    assert.equal(created.status, 200);
    const version = (await created.json()).imageVersion;
    const publicImage = await fetch(`${base}/branches/${branch.id}/image`);
    assert.equal(publicImage.status, 200);
    assert.equal(publicImage.headers.get('content-type'), 'image/jpeg');
    assert.equal(publicImage.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), jpeg);
    const metadata = await api('GET', `branches/${branch.id}`);
    assert.equal(metadata.body.imageVersion, version);
    assert.equal(metadata.body.imageData, undefined);
    assert.equal(metadata.body.imageMime, undefined);
    const list = await api('GET', 'admin/branches?limit=100', undefined, adminToken);
    assert.ok(list.body.data.every(item => item.imageData === undefined && item.imageMime === undefined));
    assert.equal((await api('PATCH', `admin/branches/${branch.id}`, { imageVersion: randomUUID() }, adminToken)).status, 400);
    assert.equal((await api('PATCH', `admin/branches/${branch.id}`, { isActive: false }, adminToken)).status, 200);
    assert.equal((await fetch(`${base}/branches/${branch.id}/image`)).status, 404);
    assert.equal((await adminRead()).status, 401);
    assert.equal((await adminRead(staffToken)).status, 403);
    assert.equal((await adminRead(adminToken)).status, 200);
    const replacement = await upload(jpeg);
    assert.equal(replacement.status, 200);
    assert.notEqual((await replacement.json()).imageVersion, version);
    assert.equal((await api('DELETE', `admin/branches/${branch.id}/image`, undefined, customer.body.accessToken)).status, 403);
    assert.equal((await api('DELETE', `admin/branches/${branch.id}/image`, undefined, adminToken)).status, 200);
    assert.equal((await api('DELETE', `admin/branches/${branch.id}/image`, undefined, adminToken)).status, 200);
    assert.equal((await adminRead(adminToken)).status, 404);
    const persisted = await db.branch.findUniqueOrThrow({ where: { id: branch.id } });
    assert.equal(persisted.imageData, null); assert.equal(persisted.imageMime, null); assert.equal(persisted.imageVersion, null);
    console.log('OK: imágenes persistidas, subida/reemplazo/borrado, tamaño, contenido, permisos, inactivas y catálogo sin bytes.');
  } finally {
    await db.branch.deleteMany({ where: { id: branch.id } });
    await db.user.deleteMany({ where: { email } });
  }
};
