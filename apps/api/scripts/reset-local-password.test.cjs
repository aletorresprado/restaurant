const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { resetLocalPassword } = require('./reset-local-password.cjs');

test('local password reset preserves account data, rejects weak passwords and removes only its sessions', async () => {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const target = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/app_resto_dev');
  assert.equal(process.env.NODE_ENV ?? 'development', 'development');
  const db = new PrismaClient();
  const ids = [randomUUID(), randomUUID()];
  const email = `reset-${ids[0]}@example.test`;
  const oldPassword = `Old1-${randomUUID()}`;
  const newPassword = `New1-${randomUUID()}`;
  try {
    for (const [index, id] of ids.entries()) {
      await db.user.create({ data: { id, email: index ? `other-${id}@example.test` : email,
        firstName: 'Reset', lastName: 'Test', role: 'STAFF', loyaltyBalance: 7,
        passwordHash: await bcrypt.hash(oldPassword, 12),
        sessions: { create: { refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } },
      } });
    }
    await assert.rejects(resetLocalPassword(db, email, 'weak'));
    assert.equal(await db.session.count({ where: { userId: ids[0] } }), 1);
    await resetLocalPassword(db, email.toUpperCase(), newPassword);
    const user = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
    assert.equal(user.role, 'STAFF');
    assert.equal(user.loyaltyBalance, 7);
    assert.equal(user.firstName, 'Reset');
    assert.equal(user.isActive, true);
    assert.ok(await bcrypt.compare(newPassword, user.passwordHash));
    assert.equal(await bcrypt.compare(oldPassword, user.passwordHash), false);
    assert.equal(await db.session.count({ where: { userId: ids[0] } }), 0);
    assert.equal(await db.session.count({ where: { userId: ids[1] } }), 1);
    await assert.rejects(resetLocalPassword(db, `missing-${randomUUID()}@example.test`, newPassword));
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
