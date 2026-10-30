const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async function reservationsIntegration({ api, db, branchId, otherBranchId, adminToken, staffToken }) {
  const email = `reservation-${randomUUID()}@example.invalid`;
  try {
    const customer = await api('POST', 'auth/register', { firstName: 'Reserva', lastName: 'Test', email, password: `Test1-${randomUUID()}` });
    assert.equal(customer.status, 201);
    const token = customer.body.accessToken;
    const root = `staff/branches/${branchId}`;
    const serviceDay = new Date(Date.now() + 14 * 86400000);
    while (serviceDay.getUTCDay() !== 5) serviceDay.setUTCDate(serviceDay.getUTCDate() + 1);
    const serviceDate = serviceDay.toISOString().slice(0, 10);
    const exception = await api('POST', `${root}/schedule-exceptions`, { date: serviceDate, openingTime: '18:00', closingTime: '02:00' }, adminToken);
    assert.equal(exception.status, 201);
    const largeTable = await api('POST', `${root}/tables`, { tableNumber: 'R-50', capacity: 50 }, staffToken);
    assert.equal(largeTable.status, 201);
    const smallTable = await api('POST', `${root}/tables`, { tableNumber: 'R-4', capacity: 4 }, staffToken);
    assert.equal(smallTable.status, 201);
    const url = `branches/${branchId}/availability?date=${serviceDate}&partySize=50`;
    assert.equal((await api('GET', `branches/${branchId}/availability?date=invalid&partySize=0`)).status, 400);
    const available = await api('GET', url);
    assert.equal(available.status, 200);
    assert.equal(available.body.durationMinutes, 120);
    assert.equal(available.body.slots.length, 13);
    const startAt = available.body.slots[0].startAt;
    const data = { branchId, serviceDate, startAt, partySize: 50 };
    assert.equal((await api('POST', 'reservations', data)).status, 401);
    assert.equal((await api('POST', 'reservations', data, staffToken)).status, 403);
    assert.equal((await api('POST', 'reservations', { ...data, partySize: 51 }, token)).status, 400);
    assert.equal((await api('POST', 'reservations', { ...data, startAt: new Date(Date.parse(startAt) + 1).toISOString() }, token)).status, 400);
    const race = await Promise.all([api('POST', 'reservations', data, token), api('POST', 'reservations', data, token)]);
    assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
    const reservation = race.find(r => r.status === 201).body;
    assert.equal(reservation.status, 'CONFIRMED');
    assert.equal(reservation.tableId, largeTable.body.id);
    assert.equal(reservation.events[0].type, 'RESERVATION_CREATED');
    assert.equal(reservation.events[0].actorId, customer.body.user.id);
    assert.equal((await api('GET', `reservations/${reservation.id}`, undefined, adminToken)).status, 404);
    assert.equal((await api('GET', 'reservations', undefined, token)).body.meta.total, 1);
    const after = await api('GET', url);
    assert.equal(after.body.slots.some(s => s.startAt === startAt), false);
    const adjacent = await api('POST', 'reservations', { ...data, startAt: reservation.endAt }, token);
    assert.equal(adjacent.status, 201);
    assert.equal((await api('GET', `${root}/reservations?date=${serviceDate}`, undefined, staffToken)).body.meta.total, 2);
    assert.equal((await api('GET', `${root}/reservations?date=${serviceDate}`, undefined, token)).status, 403);
    assert.equal((await api('GET', `staff/branches/${otherBranchId}/reservations/${reservation.id}`, undefined, adminToken)).status, 404);
    assert.equal((await api('POST', `staff/branches/${otherBranchId}/reservations/${reservation.id}/cancel`, { reason: 'Ajena' }, staffToken)).status, 403);
    assert.equal((await api('PATCH', `${root}/tables/${largeTable.body.id}`, { tableStatus: 'OUT_OF_SERVICE' }, adminToken)).status, 409);
    assert.equal((await api('PATCH', `${root}/tables/${largeTable.body.id}`, { capacity: 49 }, adminToken)).status, 409);
    assert.equal((await api('POST', `${root}/tables/${largeTable.body.id}/blocks`, { startAt, endAt: reservation.endAt, reason: 'Conflicto' }, adminToken)).status, 409);
    assert.equal((await api('PATCH', `${root}/schedule-exceptions/${exception.body.id}`, { isClosed: true }, adminToken)).status, 409);
    assert.equal((await api('PATCH', `admin/branches/${branchId}`, { isActive: false }, adminToken)).status, 409);
    const cancelled = await api('POST', `reservations/${reservation.id}/cancel`, { reason: 'Cambio de planes' }, token);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, 'CANCELLED_BY_CUSTOMER');
    assert.equal((await api('POST', `reservations/${reservation.id}/cancel`, {}, token)).status, 200);
    assert.equal(await db.reservationEvent.count({ where: { reservationId: reservation.id } }), 2);
    assert.equal((await api('GET', url)).body.slots.some(s => s.startAt === startAt), true);
    assert.equal((await api('POST', `${root}/reservations/${adjacent.body.id}/cancel`, {}, staffToken)).status, 400);
    assert.equal((await api('POST', `${root}/reservations/${adjacent.body.id}/cancel`, { reason: 'Cierre extraordinario' }, staffToken)).status, 200);
    const bestFit = await api('POST', 'reservations', { ...data, partySize: 4 }, token);
    assert.equal(bestFit.status, 201);
    assert.equal(bestFit.body.tableId, smallTable.body.id);
    await api('POST', `reservations/${bestFit.body.id}/cancel`, {}, token);
    // A block prevents booking and disappears from availability; touching endpoints remain usable.
    const block = await api('POST', `${root}/tables/${largeTable.body.id}/blocks`, { startAt, endAt: reservation.endAt, reason: 'Evento privado' }, staffToken);
    assert.equal(block.status, 201);
    assert.equal((await api('POST', 'reservations', data, token)).status, 409);
    assert.equal((await api('GET', url)).body.slots.some(s => s.startAt === startAt), false);
    assert.equal((await api('DELETE', `${root}/tables/${largeTable.body.id}/blocks/${block.body.id}`, undefined, staffToken)).status, 200);
    const bookingVsBlock = await Promise.all([
      api('POST', 'reservations', data, token),
      api('POST', `${root}/tables/${largeTable.body.id}/blocks`, { startAt, endAt: reservation.endAt, reason: 'Bloqueo concurrente' }, staffToken),
    ]);
    assert.deepEqual(bookingVsBlock.map(r => r.status).sort(), [201, 409]);
    if (bookingVsBlock[0].status === 201) {
      assert.equal((await api('POST', `reservations/${bookingVsBlock[0].body.id}/cancel`, {}, token)).status, 200);
    } else {
      assert.equal((await api('DELETE', `${root}/tables/${largeTable.body.id}/blocks/${bookingVsBlock[1].body.id}`, undefined, staffToken)).status, 200);
    }
    const closingSlot = available.body.slots.at(-1);
    const night = await api('POST', 'reservations', { ...data, startAt: closingSlot.startAt }, token);
    assert.equal(night.status, 201);
    assert.equal(night.body.endAt, closingSlot.endAt);
    assert.equal((await api('POST', 'reservations', { ...data, startAt: closingSlot.endAt }, token)).status, 400);
    await api('POST', `reservations/${night.body.id}/cancel`, {}, token);
    // Persist a near-term fixture to exercise cancellation policy independently of wall-clock slots.
    const near = await db.reservation.create({ data: { userId: customer.body.user.id, branchId, tableId: largeTable.body.id, serviceDate,
      partySize: 50, startAt: new Date(Date.now() + 3600000), endAt: new Date(Date.now() + 10800000) } });
    assert.equal((await api('POST', `reservations/${near.id}/cancel`, {}, token)).status, 403);
    assert.equal((await api('POST', `${root}/reservations/${near.id}/cancel`, { reason: 'Cancelación por personal' }, staffToken)).status, 200);
    await require('./attendance.integration.cjs')({ api, db, staffToken, adminToken, customerToken: token, customerId: customer.body.user.id });
    console.log('OK: disponibilidad, reserva concurrente, mejor capacidad, privacidad, agenda, cancelación y protección de configuración.');
  } finally {
    await db.user.deleteMany({ where: { email } });
  }
};
