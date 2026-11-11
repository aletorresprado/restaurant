const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async ({ api, db }) => {
  const emails = [0, 1].map(() => `operation-${randomUUID()}@example.invalid`);
  let branch;
  try {
    const customers = [];
    for (const email of emails) {
      const result = await api('POST', 'auth/register', { firstName: 'Operation', lastName: 'Test', email, password: `Test1-${randomUUID()}` });
      assert.equal(result.status, 201);
      customers.push(result.body);
    }
    const date = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
    branch = await db.branch.create({ data: {
      name: `Operation ${randomUUID()}`, address: 'Temporal 123',
      tables: { create: Array.from({ length: 6 }, (_, n) => ({ tableNumber: `I-${n}`, capacity: 4 })) },
      exceptions: { create: { date, openingTime: '18:00', closingTime: '23:00' } },
    }, include: { tables: true } });
    const operationId = randomUUID();
    const data = { branchId: branch.id, serviceDate: date, startAt: `${date}T18:00:00-03:00`, partySize: 2, operationId };
    const send = (body, index = 0) => api('POST', 'reservations', body, customers[index].accessToken);
    assert.equal((await send({ ...data, operationId: 'invalid' })).status, 400);
    const race = await Promise.all(Array.from({ length: 4 }, (_, index) => send({ ...data, operationId: index % 2 ? operationId.toUpperCase() : operationId })));
    assert.ok(race.every(r => r.status === 201), JSON.stringify(race.map(r => r.status)));
    assert.equal(new Set(race.map(r => r.body.id)).size, 1);
    const reservation = race[0].body;
    assert.equal(await db.reservation.count({ where: { branchId: branch.id } }), 1);
    assert.equal(await db.reservationEvent.count({ where: { reservationId: reservation.id } }), 1);
    const equivalent = await send({ ...data, branchId: data.branchId.toUpperCase(), startAt: new Date(data.startAt).toISOString() });
    assert.equal(equivalent.body.id, reservation.id);
    for (const changed of [{ partySize: 3 }, { branchId: randomUUID() }, { serviceDate: '2030-01-01' }, { startAt: `${date}T18:30:00-03:00` }])
      assert.equal((await send({ ...data, ...changed })).status, 409);
    const foreign = await send(data, 1);
    assert.equal(foreign.status, 201);
    assert.notEqual(foreign.body.id, reservation.id);
    assert.equal((await api('GET', `reservations/${reservation.id}`, undefined, customers[1].accessToken)).status, 404);
    const deliberate = await send({ ...data, operationId: randomUUID() });
    assert.equal(deliberate.status, 201);
    assert.notEqual(deliberate.body.id, reservation.id);
    // Replaying a terminal reservation must neither create nor reactivate anything.
    assert.equal((await api('POST', `reservations/${reservation.id}/cancel`, {}, customers[0].accessToken)).status, 200);
    await db.branch.update({ where: { id: branch.id }, data: { isActive: false } });
    const replay = await send(data);
    assert.equal(replay.status, 201);
    assert.equal(replay.body.id, reservation.id);
    assert.equal(replay.body.status, 'CANCELLED_BY_CUSTOMER');
    assert.equal(await db.reservationEvent.count({ where: { reservationId: reservation.id } }), 2);
    assert.equal(await db.reservation.count({ where: { branchId: branch.id } }), 3);
    await db.branch.update({ where: { id: branch.id }, data: { isActive: true } });
    // A rejected attempt does not consume its key; retry after configuration is fixed.
    const rejected = { ...data, operationId: randomUUID(), startAt: `${date}T23:00:00-03:00` };
    assert.equal((await send(rejected)).status, 400);
    assert.equal(await db.reservation.count({ where: { operationId: rejected.operationId } }), 0);
    await db.branchScheduleException.update({ where: { branchId_date: { branchId: branch.id, date } }, data: { closingTime: '02:00' } });
    assert.equal((await send(rejected)).status, 201);
    // Historical completed operations remain retrievable with a matching request.
    const historical = { ...data, serviceDate: '2020-01-01', startAt: '2020-01-01T21:00:00Z', operationId: randomUUID() };
    const past = await db.reservation.create({ data: {
      ...historical, startAt: new Date(historical.startAt), endAt: new Date('2020-01-01T23:00:00Z'),
      userId: customers[0].user.id, tableId: branch.tables[0].id, status: 'ATTENDED',
    } });
    assert.equal((await send(historical)).body.id, past.id);
    console.log('OK: operaciones de reserva concurrentes, reenvios, privacidad, conflictos de contenido, cancelacion y recuperacion historica.');
  } finally {
    if (branch) await db.branch.delete({ where: { id: branch.id } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
  }
};
