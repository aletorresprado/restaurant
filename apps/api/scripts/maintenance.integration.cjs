const assert = require('node:assert/strict');
require('reflect-metadata');
const { MaintenanceService } = require('../dist/maintenance/maintenance.service');

module.exports = async ({ db, base }) => {
  const ready = await fetch(`${base}/health/ready`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).checks.database, 'up');

  // Connection-local shadow tables use the real SQL/schema without deleting any application records.
  await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL TIME ZONE 'Pacific/Auckland'`;
    await tx.$executeRaw`CREATE TEMP TABLE "Session" (LIKE public."Session" INCLUDING ALL) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE "AccountActionToken" (LIKE public."AccountActionToken" INCLUDING ALL) ON COMMIT DROP`;
    const past = new Date(Date.now() - 60000), future = new Date(Date.now() + 60000);
    const seed = async (count, expiresAt) => {
      await tx.$executeRaw`INSERT INTO "Session" (id, "userId", "refreshTokenHash", "expiresAt")
        SELECT gen_random_uuid(), gen_random_uuid(), gen_random_uuid()::text,
        (${expiresAt}::timestamptz AT TIME ZONE 'UTC') FROM generate_series(1, ${count}::int)`;
      await tx.$executeRaw`INSERT INTO "AccountActionToken" (id, "userId", purpose, email, "tokenHash", "expiresAt")
        SELECT gen_random_uuid(), gen_random_uuid(), 'RESET_PASSWORD'::public."AccountActionPurpose", 'fixture@example.invalid',
        md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
        (${expiresAt}::timestamptz AT TIME ZONE 'UTC') FROM generate_series(1, ${count}::int)`;
    };
    await seed(25, past); await seed(1, future);
    const service = new MaintenanceService({ $transaction: fn => fn(tx) }, { get: key => key === 'MAINTENANCE_BATCH_SIZE' ? 10 : undefined });
    assert.deepEqual(await service.run(), { sessions: 25, links: 25, batches: 3, capped: false });
    const sessions = await tx.$queryRaw`SELECT "expiresAt" FROM "Session"`;
    const links = await tx.$queryRaw`SELECT "expiresAt" FROM "AccountActionToken"`;
    assert.equal(sessions.length, 1); assert.equal(links.length, 1);
    assert.equal(sessions[0].expiresAt.getTime(), future.getTime());
    assert.equal(links[0].expiresAt.getTime(), future.getTime());
    assert.deepEqual(await service.run(), { sessions: 0, links: 0, batches: 1, capped: false });
    await seed(103, past);
    assert.deepEqual(await service.run(), { sessions: 100, links: 100, batches: 10, capped: true });
    assert.deepEqual(await service.run(), { sessions: 3, links: 3, batches: 1, capped: false });
    await service.onModuleDestroy();
  }, { maxWait: 5000, timeout: 15000 });
  console.log('OK: readiness PostgreSQL y limpieza real en tablas temporales, sesiones/enlaces vigentes intactos, lotes acotados e idempotencia.');
};
