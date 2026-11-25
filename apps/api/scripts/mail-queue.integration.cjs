const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { MailQueue } = require('../dist/auth/mail-queue');

module.exports = async ({ db }) => {
  // Connection-local copies: exercise actual SQL without claiming application messages.
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "User" (LIKE public."User" INCLUDING ALL) ON COMMIT DROP');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "AccountActionToken" (LIKE public."AccountActionToken" INCLUDING ALL) ON COMMIT DROP');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "MailJob" (LIKE public."MailJob" INCLUDING ALL) ON COMMIT DROP');
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Auckland'");
    const user = { id: randomUUID(), email: `queue-${randomUUID()}@example.invalid` };
    await tx.$executeRaw`INSERT INTO "User" (id,email,"firstName","lastName","passwordHash","updatedAt")
      VALUES (${user.id}::uuid,${user.email},'Queue','Fixture','fixture',CURRENT_TIMESTAMP)`;
    // Prisma model delegates qualify public tables; use a tiny raw adapter for these temp copies.
    const isolated = {
      $executeRaw: (...args) => tx.$executeRaw(...args),
      $queryRaw: (...args) => tx.$queryRaw(...args),
      user: { findUnique: async () => ({ ...user, isActive: true }) },
      accountActionToken: { findUnique: async () => null },
      mailJob: {
        create: async ({ data }) => {
          const rows = await tx.$queryRaw`INSERT INTO "MailJob" (id,"userId",scope,payload,"expiresAt","tokenHash","availableAt","createdAt")
            VALUES (${randomUUID()}::uuid,${data.userId}::uuid,${data.scope},${data.payload},(${data.expiresAt}::timestamptz AT TIME ZONE 'UTC'),${data.tokenHash ?? null},(${data.availableAt}::timestamptz AT TIME ZONE 'UTC'),(${data.createdAt}::timestamptz AT TIME ZONE 'UTC')) RETURNING *`;
          return rows[0];
        },
        updateMany: async ({ where, data }) => {
          const fields = Object.entries(data).map(([key,value]) => Prisma.sql`${Prisma.raw('"'+key+'"')} = ${value instanceof Date ? Prisma.sql`(${value}::timestamptz AT TIME ZONE 'UTC')` : value}`);
          const count = await tx.$executeRaw(Prisma.sql`UPDATE "MailJob" SET ${Prisma.join(fields)}
            WHERE id = ${where.id}::uuid AND status = ${where.status} AND attempts = ${where.attempts}`);
          return { count };
        },
      },
    };
    const read = async id => (await tx.$queryRaw`SELECT * FROM "MailJob" WHERE id = ${id}::uuid`)[0];
    const config = new ConfigService({ JWT_ACCESS_SECRET: 'fixture-queue-only-secret-never-used-for-sessions' });
    let calls = 0;
    let fail = true;
    const transport = { send: async () => { calls++; if (fail) throw new Error('fixture transport outage'); } };
    const first = new MailQueue(isolated, config, transport);
    first.logger.warn = () => {};
    const message = { to: user.email, subject: 'Fixture', text: 'secret-queue-token-fixture' };
    const job = await first.enqueue(isolated, user.id, message, new Date(Date.now() + 3600000));
    assert.ok(!job.payload.includes(message.text));
    await first.run();
    const deferred = await read(job.id);
    assert.equal(deferred.status, 'pending'); assert.equal(deferred.attempts, 1, 'failed delivery must increment attempts');
    assert.ok(deferred.availableAt > new Date());
    await first.onModuleDestroy();
    // A fresh service reads the persisted encrypted row and recovers a failed attempt.
    fail = false;
    await tx.$executeRaw`UPDATE "MailJob" SET "availableAt" = '1970-01-01' WHERE id = ${job.id}::uuid`;
    const restarted = new MailQueue(isolated, config, transport);
    await restarted.run();
    const sent = await read(job.id);
    assert.equal(sent.status, 'sent'); assert.equal(sent.attempts, 2); assert.equal(sent.payload, null);
    assert.equal(calls, 2);
    await restarted.run(); assert.equal(calls, 2);
    const stale = await first.enqueue(isolated, user.id, message, new Date(Date.now() + 3600000), 'a'.repeat(64));
    await restarted.run();
    assert.equal((await read(stale.id)).status, 'cancelled');
    const crashed = await first.enqueue(isolated, user.id, message, new Date(Date.now() + 3600000));
    await tx.$executeRaw`UPDATE "MailJob" SET attempts = 5, "availableAt" = '1970-01-01' WHERE id = ${crashed.id}::uuid`;
    await restarted.run();
    const exhausted = await read(crashed.id);
    assert.equal(exhausted.status, 'failed'); assert.equal(exhausted.payload, null);
    const expired = await first.enqueue(isolated, user.id, message, new Date(0));
    await restarted.run();
    assert.equal((await read(expired.id)).status, 'failed');
    assert.equal(calls, 2);
    await first.enqueue(isolated, user.id, message, new Date(Date.now() + 3600000));
    const competing = new MailQueue(isolated, config, transport);
    await Promise.all([restarted.run(), competing.run()]);
    assert.equal(calls, 3, 'Competing claims must not deliver the same lease twice');
    await competing.onModuleDestroy();
    const other = await first.enqueue(isolated, user.id, message, new Date(Date.now() + 3600000));
    await tx.$executeRaw`UPDATE "MailJob" SET scope = 'another-environment' WHERE id = ${other.id}::uuid`;
    await restarted.run();
    assert.equal((await read(other.id)).attempts, 0, 'A worker must not claim another environment');
    await tx.$executeRaw`DELETE FROM "MailJob" WHERE id = ${other.id}::uuid`;
    await tx.$executeRaw`UPDATE "MailJob" SET "finishedAt" = '1970-01-01'`;
    await restarted.run(); assert.equal(Number((await tx.$queryRaw`SELECT count(*) AS n FROM "MailJob"`)[0].n), 0);
    await restarted.onModuleDestroy();
  }, { timeout: 30000 });
  console.log('Persistent mail queue integration passed (encrypted retry, restart, expiry, cancellation, retention, UTC).');
};
