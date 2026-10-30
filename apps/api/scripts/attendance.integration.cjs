const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { formatInTimeZone } = require('date-fns-tz');
const { BUSINESS_CONFIG } = require('@repo/config');

module.exports = async function attendanceIntegration({ api, db, staffToken, adminToken, customerToken, customerId }) {
  const staff = await api('GET', 'auth/me', undefined, staffToken);
  const now = Date.now();
  const hour = 3600000;
  const zone = BUSINESS_CONFIG.timezone;
  const windowStart = new Date(now - 2 * hour);
  const serviceDate = formatInTimeZone(windowStart, zone, 'yyyy-MM-dd');
  const branch = await db.branch.create({ data: {
    name: `Attendance test ${randomUUID()}`, address: 'Dirección temporal de integración 123',
    staff: { create: { userId: staff.body.id } },
    tables: { create: [{ tableNumber: 'A-50', capacity: 50 }, { tableNumber: 'A-49', capacity: 49 }] },
    exceptions: { create: { date: serviceDate, openingTime: formatInTimeZone(windowStart, zone, 'HH:mm'), closingTime: formatInTimeZone(new Date(now + 3 * hour), zone, 'HH:mm') } },
  }, include: { tables: true } });
  try {
    const root = `staff/branches/${branch.id}`;
    const table50 = branch.tables.find(t => t.capacity === 50);
    const table49 = branch.tables.find(t => t.capacity === 49);
    const fixture = (minutesAgo, tableId = table50.id, status = 'CONFIRMED') => db.reservation.create({ data: {
      userId: customerId, branchId: branch.id, tableId, serviceDate, partySize: tableId === table50.id ? 50 : 49,
      startAt: new Date(now - minutesAgo * 60000), endAt: new Date(now - minutesAgo * 60000 + 2 * hour), status,
      events: { create: { actorId: customerId, type: 'RESERVATION_CREATED' } },
    } });
    const attended = await fixture(60);
    const noShow = await fixture(60, table49.id);
    const endpoint = id => `${root}/reservations/${id}/attendance`;
    assert.equal((await api('POST', endpoint(attended.id), { outcome: 'ATTENDED' })).status, 401);
    assert.equal((await api('POST', endpoint(attended.id), { outcome: 'ATTENDED' }, customerToken)).status, 403);
    assert.equal((await api('POST', endpoint(attended.id), { outcome: 'UNKNOWN' }, staffToken)).status, 400);
    assert.equal((await api('POST', endpoint(attended.id), { outcome: 'ATTENDED', status: 'CONFIRMED' }, staffToken)).status, 400);
    assert.equal((await api('POST', endpoint(randomUUID()), { outcome: 'ATTENDED' }, staffToken)).status, 404);
    const wrongBranch = `staff/branches/${randomUUID()}/reservations/${attended.id}/attendance`;
    assert.equal((await api('POST', wrongBranch, { outcome: 'ATTENDED' }, adminToken)).status, 404);
    const future = await fixture(-60);
    assert.equal((await api('POST', endpoint(future.id), { outcome: 'ATTENDED' }, staffToken)).status, 409);
    assert.equal((await api('POST', endpoint(future.id), { outcome: 'NO_SHOW' }, staffToken)).status, 409);
    await db.reservation.delete({ where: { id: future.id } });
    const recent = await fixture(5);
    assert.equal((await api('POST', endpoint(recent.id), { outcome: 'NO_SHOW' }, staffToken)).status, 409);
    await db.reservation.delete({ where: { id: recent.id } });
    const cancellations = await fixture(60, table49.id, 'CANCELLED_BY_CUSTOMER');
    assert.equal((await api('POST', endpoint(cancellations.id), { outcome: 'ATTENDED' }, staffToken)).status, 409);
    const duplicate = await Promise.all([
      api('POST', endpoint(attended.id), { outcome: 'ATTENDED', reason: 'Cliente presente' }, staffToken),
      api('POST', endpoint(attended.id), { outcome: 'ATTENDED' }, staffToken),
    ]);
    assert.deepEqual(duplicate.map(r => r.status), [200, 200]);
    assert.equal(duplicate[0].body.status, 'ATTENDED');
    const event = await db.reservationEvent.findMany({ where: { reservationId: attended.id, type: 'ATTENDANCE_CONFIRMED' } });
    assert.equal(event.length, 1);
    assert.equal(event[0].actorId, staff.body.id);
    assert.equal((await api('POST', endpoint(attended.id), { outcome: 'NO_SHOW' }, staffToken)).status, 409);
    assert.equal((await api('POST', `${root}/reservations/${attended.id}/cancel`, { reason: 'No corresponde' }, staffToken)).status, 409);
    assert.equal((await api('POST', `${root}/tables/${table50.id}/blocks`, { startAt: attended.startAt.toISOString(), endAt: attended.endAt.toISOString(), reason: 'Conflicto con asistencia' }, staffToken)).status, 409);
    assert.equal((await api('PATCH', `${root}/tables/${table50.id}`, { tableStatus: 'OUT_OF_SERVICE' }, staffToken)).status, 409);
    assert.equal((await api('PATCH', `admin/branches/${branch.id}`, { isActive: false }, adminToken)).status, 409);
    const availability = `branches/${branch.id}/availability?date=${serviceDate}&partySize=49`;
    const before = await api('GET', availability);
    const absent = await api('POST', endpoint(noShow.id), { outcome: 'NO_SHOW', reason: 'No se presentó' }, staffToken);
    assert.equal(absent.status, 200);
    assert.equal(absent.body.status, 'NO_SHOW');
    assert.equal((await api('POST', endpoint(noShow.id), { outcome: 'NO_SHOW' }, adminToken)).status, 200);
    assert.equal(await db.reservationEvent.count({ where: { reservationId: noShow.id, type: 'NO_SHOW_RECORDED' } }), 1);
    const after = await api('GET', availability);
    const released = after.body.slots.filter(slot => !before.body.slots.some(previous => previous.startAt === slot.startAt));
    assert.ok(released.length > 0, 'La ausencia debe liberar turnos de la mesa');
    assert.ok(released.every(slot => slot.availableTables === 1), 'La mesa con asistencia debe seguir ocupada');
    const race = await fixture(180);
    const competing = await Promise.all([
      api('POST', endpoint(race.id), { outcome: 'ATTENDED' }, staffToken),
      api('POST', endpoint(race.id), { outcome: 'NO_SHOW' }, staffToken),
    ]);
    assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
    assert.equal(await db.reservationEvent.count({ where: { reservationId: race.id } }), 2);
    console.log('OK: asistencia y ausencia, permisos, tolerancia, eventos únicos, ocupación e idempotencia concurrente.');
  } finally { await db.branch.deleteMany({ where: { id: branch.id } }); }
};
