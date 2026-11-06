import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const bcrypt = apiRequire('bcryptjs');
const environment = fileURLToPath(new URL('../../api/.env', import.meta.url));
if (existsSync(environment)) process.loadEnvFile(environment);
const plusDay = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function login(page: Page, email: string, navigate = true) {
  if (navigate) await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
  const response = page.waitForResponse((r) => r.url().endsWith('/auth/login'));
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  return (await (await response).json()).accessToken as string;
}
async function logout(page: Page, name: string) {
  await page.getByRole('button', { name: `Salir (${name})`, exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ingresar', exact: true }).first()).toBeVisible();
}
async function createWeekly(page: Page, day: string, opening: string, closing: string) {
  await page.getByRole('button', { name: 'Nuevo horario', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear horario semanal', exact: true });
  await form.getByLabel('Día de la semana').selectOption(day);
  await form.getByLabel('Hora de apertura').fill(opening);
  await form.getByLabel('Hora de cierre').fill(closing);
  await form.getByRole('button', { name: 'Guardar horario', exact: true }).click();
  return form;
}
async function createException(
  page: Page,
  date: string,
  closed: boolean,
  opening = '12:00',
  closing = '23:00',
) {
  await page.getByRole('button', { name: 'Nueva excepción', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear excepción', exact: true });
  await form.getByLabel('Fecha de la excepción').fill(date);
  await form.getByLabel('No inicia servicio en esta fecha').setChecked(closed);
  if (!closed) {
    await form.getByLabel('Hora de apertura').fill(opening);
    await form.getByLabel('Hora de cierre').fill(closing);
  }
  await form.getByLabel('Motivo interno (opcional)').fill('Motivo de prueba interno');
  await form.getByRole('button', { name: 'Guardar excepción', exact: true }).click();
  if (closed)
    await form.getByRole('button', { name: 'Confirmar cierre del servicio', exact: true }).click();
  return form;
}

test('weekly hours and date exceptions preserve overnight services, reservations and branch permissions', async ({
  page,
  request,
}, info) => {
  test.setTimeout(150000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const emails = ['staff', 'admin', 'customer'].map(
    (role) => `hours-${role}-${suffix}@example.invalid`,
  );
  const branchIds: string[] = [];
  try {
    const hash = await bcrypt.hash('Password123', 4);
    const users = [];
    for (const [index, role] of ['STAFF', 'ADMIN', 'CUSTOMER'].entries())
      users.push(
        await db.user.create({
          data: {
            firstName: role,
            lastName: 'Temporal',
            email: emails[index],
            passwordHash: hash,
            role,
          },
        }),
      );
    const [staff, admin, customer] = users;
    let monday = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
    while (new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) monday = plusDay(monday, 1);
    const tuesday = plusDay(monday, 1);
    const branch = await db.branch.create({
      data: {
        name: `Horarios principal ${suffix.slice(0, 8)}`,
        address: 'Dirección temporal 123',
        staff: { create: { userId: staff.id } },
        tables: { create: { tableNumber: 'H-1', capacity: 4 } },
      },
      include: { tables: true },
    });
    branchIds.push(branch.id);
    const other = await db.branch.create({
      data: {
        name: `No asignada ${suffix.slice(0, 8)}`,
        address: 'Otra dirección temporal 123',
        schedules: { create: { dayOfWeek: 1, openingTime: '18:00', closingTime: '23:00' } },
      },
      include: { schedules: true },
    });
    branchIds.push(other.id);
    const inactive = await db.branch.create({
      data: {
        name: `Inactiva ${suffix.slice(0, 8)}`,
        address: 'Dirección inactiva 123',
        isActive: false,
        staff: { create: { userId: staff.id } },
      },
    });
    branchIds.push(inactive.id);
    const hours = (date = monday) =>
      request.get(`/api/v1/branches/${branch.id}/hours?date=${date}`).then((r) => r.json());
    await page.goto('/horarios');
    await page.getByRole('main').getByRole('link', { name: 'Ingresar', exact: true }).click();
    const staffToken = await login(page, staff.email, false);
    await expect(
      page.getByRole('heading', { name: 'Horarios y excepciones', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Sucursal de los horarios')).toHaveValue(branch.id);
    expect(
      await page
        .getByLabel('Sucursal de los horarios')
        .locator('option:not([disabled])')
        .allTextContents(),
    ).toEqual([branch.name]);
    await expect(
      page.getByText('Todavía no hay horarios semanales', { exact: true }),
    ).toBeVisible();
    let form = await createWeekly(page, '1', '18:00', '18:00');
    await expect(
      form.getByText('El horario de apertura y cierre no pueden ser iguales', { exact: true }),
    ).toBeVisible();
    await form.getByLabel('Hora de cierre').fill('23:00');
    await form.getByRole('button', { name: 'Guardar horario', exact: true }).click();
    await expect(form).toHaveCount(0);
    await page.getByRole('button', { name: 'Editar horario Lunes', exact: true }).click();
    form = page.getByRole('form', { name: 'Editar horario semanal', exact: true });
    await form.getByLabel('Hora de apertura').fill('22:00');
    await form.getByLabel('Hora de cierre').fill('02:00');
    await form.getByLabel('Intervalo entre turnos (minutos)').fill('45');
    await form.getByRole('button', { name: 'Guardar horario', exact: true }).click();
    await expect(form).toHaveCount(0);
    let effective = await hours();
    expect(effective.window).toEqual({
      startAt: `${tuesday}T01:00:00.000Z`,
      endAt: `${tuesday}T05:00:00.000Z`,
    });
    expect(effective.reservationIntervalMinutes).toBe(45);
    await page.getByLabel('Fecha a consultar').fill(monday);
    const preview = page.getByRole('region', { name: 'Servicio efectivo', exact: true });
    await expect(preview.getByText('Origen: horario semanal', { exact: true })).toBeVisible();
    form = await createWeekly(page, '2', '01:00', '03:00');
    await expect(form.getByRole('alert')).toContainText('Los horarios semanales se superponen');
    expect(await db.branchSchedule.count({ where: { branchId: branch.id, dayOfWeek: 2 } })).toBe(0);
    await form.getByLabel('Hora de apertura').fill('02:00');
    await form.getByLabel('Hora de cierre').fill('04:00');
    await form.getByRole('button', { name: 'Guardar horario', exact: true }).click();
    await expect(form).toHaveCount(0);
    form = await createException(page, monday, true);
    await expect(form).toHaveCount(0);
    expect((await hours()).isClosed).toBe(true);
    expect((await hours()).reason).toBeUndefined();
    await expect(
      preview.getByText('No inicia servicio en esta fecha.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: `Editar excepción ${monday}`, exact: true }).click();
    form = page.getByRole('form', { name: 'Editar excepción', exact: true });
    await expect(form.getByLabel('Fecha de la excepción')).toHaveCount(0);
    await form.getByLabel('No inicia servicio en esta fecha').uncheck();
    await form.getByRole('button', { name: 'Guardar excepción', exact: true }).click();
    await expect(form.getByText('Ingresá la hora de apertura.', { exact: true })).toBeVisible();
    await form.getByLabel('Hora de apertura').fill('21:00');
    await form.getByLabel('Hora de cierre').fill('01:00');
    await form.getByLabel('Motivo interno (opcional)').fill('');
    await form.getByRole('button', { name: 'Guardar excepción', exact: true }).click();
    await expect(form).toHaveCount(0);
    effective = await hours();
    expect(effective.window).toEqual({
      startAt: `${tuesday}T00:00:00.000Z`,
      endAt: `${tuesday}T04:00:00.000Z`,
    });
    expect(effective.reservationIntervalMinutes).toBe(45);
    // Closing Tuesday cannot cut Monday's overnight service.
    form = await createException(page, tuesday, true);
    await expect(form).toHaveCount(0);
    expect((await hours()).window.endAt).toBe(`${tuesday}T04:00:00.000Z`);
    expect((await hours(tuesday)).window).toBeNull();
    await page.getByRole('button', { name: `Eliminar excepción ${tuesday}`, exact: true }).click();
    await page
      .getByRole('group', { name: 'Confirmar eliminación', exact: true })
      .getByRole('button', { name: 'Confirmar eliminación', exact: true })
      .click();
    await expect(
      page.getByRole('group', { name: 'Confirmar eliminación', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: `Eliminar excepción ${monday}`, exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
    await expect(
      page.getByRole('group', { name: 'Confirmar eliminación', exact: true }),
    ).toHaveCount(0);
    expect((await hours()).source).toBe('WEEKLY');
    form = await createException(page, monday, true);
    await expect(form).toHaveCount(0);
    form = await createException(page, tuesday, false, '01:00', '03:00');
    await expect(form).toHaveCount(0);
    await page.getByRole('button', { name: `Eliminar excepción ${monday}`, exact: true }).click();
    let removal = page.getByRole('group', { name: 'Confirmar eliminación', exact: true });
    await removal.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
    await expect(removal.getByRole('alert')).toContainText('La excepción se superpone');
    expect(
      await db.branchScheduleException.count({ where: { branchId: branch.id, date: monday } }),
    ).toBe(1);
    await removal.getByRole('button', { name: 'Cancelar eliminación', exact: true }).click();
    await page.getByRole('button', { name: `Eliminar excepción ${tuesday}`, exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
    await expect(
      page.getByRole('group', { name: 'Confirmar eliminación', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: `Eliminar excepción ${monday}`, exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
    await expect(
      page.getByRole('group', { name: 'Confirmar eliminación', exact: true }),
    ).toHaveCount(0);
    effective = await hours();
    const startAt = new Date(Date.parse(effective.window.startAt) + 45 * 60000);
    const reservation = await db.reservation.create({
      data: {
        userId: customer.id,
        branchId: branch.id,
        tableId: branch.tables[0].id,
        serviceDate: monday,
        partySize: 2,
        startAt,
        endAt: new Date(startAt.getTime() + 7200000),
      },
    });
    await page.getByRole('button', { name: 'Editar horario Lunes', exact: true }).click();
    form = page.getByRole('form', { name: 'Editar horario semanal', exact: true });
    await form.getByLabel('Servicio semanal activo').uncheck();
    await form.getByRole('button', { name: 'Guardar horario', exact: true }).click();
    await form
      .getByRole('button', { name: 'Confirmar desactivación del servicio', exact: true })
      .click();
    await expect(form.getByRole('alert')).toContainText(
      'El cambio deja una reserva confirmada fuera del horario',
    );
    await form.getByRole('button', { name: 'Cancelar edición', exact: true }).click();
    form = await createException(page, monday, true);
    await expect(form.getByRole('alert')).toContainText(
      'El cambio deja una reserva confirmada fuera del horario',
    );
    await form.getByRole('button', { name: 'Cancelar edición', exact: true }).click();
    await page.getByRole('button', { name: 'Eliminar horario Lunes', exact: true }).click();
    removal = page.getByRole('group', { name: 'Confirmar eliminación', exact: true });
    await removal.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
    await expect(removal.getByRole('alert')).toContainText(
      'El cambio deja una reserva confirmada fuera del horario',
    );
    expect((await db.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
      'CONFIRMED',
    );
    await removal.getByRole('button', { name: 'Cancelar eliminación', exact: true }).click();
    await db.reservation.delete({ where: { id: reservation.id } });
    await page.getByRole('button', { name: 'Editar horario Lunes', exact: true }).click();
    form = page.getByRole('form', { name: 'Editar horario semanal', exact: true });
    await form.getByLabel('Servicio semanal activo').uncheck();
    await form.getByRole('button', { name: 'Guardar horario', exact: true }).click();
    await form
      .getByRole('button', { name: 'Confirmar desactivación del servicio', exact: true })
      .click();
    await expect(form).toHaveCount(0);
    expect((await hours()).source).toBe('NONE');
    await page.getByRole('button', { name: 'Editar horario Lunes', exact: true }).click();
    form = page.getByRole('form', { name: 'Editar horario semanal', exact: true });
    await form.getByLabel('Servicio semanal activo').check();
    await form.getByRole('button', { name: 'Guardar horario', exact: true }).click();
    await expect(form).toHaveCount(0);
    const uncertainDate = plusDay(monday, 30);
    await page.route(`**/api/v1/staff/branches/${branch.id}/schedule-exceptions`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.abort('failed');
    });
    form = await createException(page, uncertainDate, true);
    await expect(form.getByText('No pudimos confirmar el alta', { exact: true })).toBeVisible();
    await expect(
      form.getByRole('button', { name: 'Confirmar cierre del servicio', exact: true }),
    ).toBeDisabled();
    await form.getByRole('button', { name: 'Cerrar y revisar excepciones', exact: true }).click();
    expect(
      await db.branchScheduleException.count({
        where: { branchId: branch.id, date: uncertainDate },
      }),
    ).toBe(1);
    await page.unroute(`**/api/v1/staff/branches/${branch.id}/schedule-exceptions`);
    const farDate = plusDay(monday, 60);
    await db.branchScheduleException.createMany({
      data: Array.from({ length: 11 }, (_, index) => ({
        branchId: branch.id,
        date: plusDay(farDate, index),
        isClosed: true,
      })),
    });
    await page.getByRole('button', { name: 'Actualizar horarios', exact: true }).click();
    const exceptions = page.getByRole('region', { name: 'Excepciones por fecha', exact: true });
    await expect(exceptions.getByText('Página 1 de 2', { exact: true })).toBeVisible();
    await exceptions.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(exceptions.getByRole('listitem')).toHaveCount(2);
    await page.reload();
    await expect(page.getByLabel('Sucursal de los horarios')).toHaveValue(branch.id);
    await page.getByLabel('Fecha a consultar').fill(monday);
    await expect(preview.getByText('Origen: horario semanal', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('horarios.png'), fullPage: true });
    await page.goto(`/horarios?sucursal=${other.id}`);
    await expect(
      page.getByText('La sucursal no está disponible para tu cuenta', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await request.get(`/api/v1/staff/branches/${other.id}/schedules`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.patch(
          `/api/v1/staff/branches/${branch.id}/schedules/${other.schedules[0].id}`,
          { headers: { Authorization: `Bearer ${staffToken}` }, data: { closingTime: '20:00' } },
        )
      ).status(),
    ).toBe(404);
    await logout(page, 'STAFF');
    await login(page, admin.email);
    await page.getByRole('button', { name: 'Sucursales', exact: true }).click();
    await page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: inactive.name, exact: true }) })
      .getByRole('link', { name: 'Gestionar horarios', exact: true })
      .click();
    await expect(page.getByLabel('Sucursal de los horarios')).toHaveValue(inactive.id);
    await expect(page.getByText('Sucursal inactiva', { exact: true })).toBeVisible();
    form = await createWeekly(page, '1', '12:00', '16:00');
    await expect(form).toHaveCount(0);
    expect((await db.branch.findUniqueOrThrow({ where: { id: inactive.id } })).isActive).toBe(
      false,
    );
    await page.getByRole('button', { name: 'Eliminar horario Lunes', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
    await expect(
      page.getByText('Todavía no hay horarios semanales', { exact: true }),
    ).toBeVisible();
    await logout(page, 'ADMIN');
    const customerToken = await login(page, customer.email);
    await expect(page.getByRole('heading', { name: 'Mis reservas', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Horarios', exact: true })).toHaveCount(0);
    await page.goto('/horarios');
    await expect(
      page.getByText('Tu cuenta no tiene acceso a esta sección', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await request.get(`/api/v1/staff/branches/${branch.id}/schedule-exceptions`, {
          headers: { Authorization: `Bearer ${customerToken}` },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await db.branch.deleteMany({ where: { id: { in: branchIds } } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.$disconnect();
  }
});
