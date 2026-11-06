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
test.use({ timezoneId: 'Pacific/Auckland' });
const nextDate = (date: string, days = 1) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
async function login(page: Page, email: string) {
  await page.goto('/ingresar');
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
async function prepareBlock(page: Page, start: string, end: string, reason: string) {
  await page.getByRole('button', { name: 'Nuevo bloqueo', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear bloqueo temporal', exact: true });
  await form.getByLabel('Inicio del bloqueo').fill(start);
  await form.getByLabel('Fin del bloqueo').fill(end);
  await form.getByLabel('Motivo del bloqueo').fill(reason);
  return form;
}
async function submitBlock(page: Page) {
  const form = page.getByRole('form', { name: 'Crear bloqueo temporal', exact: true });
  await form.getByRole('button', { name: 'Revisar bloqueo', exact: true }).click();
  await form.getByRole('button', { name: 'Confirmar bloqueo', exact: true }).click();
}

test('temporary blocks use restaurant time and protect reservations and branch scope', async ({
  page,
  request,
}, info) => {
  test.setTimeout(150000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const emails = ['staff', 'admin', 'customer'].map(
    (role) => `blocks-${role}-${suffix}@example.invalid`,
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
    const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      following = nextDate(date);
    const branch = await db.branch.create({
      data: {
        name: `Bloqueos principal ${suffix.slice(0, 8)}`,
        address: 'Dirección temporal 123',
        staff: { create: { userId: staff.id } },
        tables: { create: { tableNumber: 'T-1', capacity: 4 } },
        exceptions: { create: { date, openingTime: '22:00', closingTime: '02:00' } },
      },
      include: { tables: true },
    });
    branchIds.push(branch.id);
    const other = await db.branch.create({
      data: {
        name: `No asignada ${suffix.slice(0, 8)}`,
        address: 'Otra dirección temporal 123',
        tables: { create: { tableNumber: 'T-2', capacity: 4 } },
      },
      include: { tables: true },
    });
    branchIds.push(other.id);
    const inactive = await db.branch.create({
      data: {
        name: `Inactiva ${suffix.slice(0, 8)}`,
        address: 'Dirección inactiva 123',
        isActive: false,
        tables: { create: { tableNumber: 'T-3', capacity: 4 } },
      },
      include: { tables: true },
    });
    branchIds.push(inactive.id);
    const table = branch.tables[0],
      foreignTable = other.tables[0];
    const root = `/api/v1/staff/branches/${branch.id}/tables/${table.id}/blocks`;
    const availability = () =>
      request
        .get(`/api/v1/branches/${branch.id}/availability?date=${date}&partySize=2`)
        .then((r) => r.json());
    const staffToken = await login(page, staff.email);
    await page.getByRole('link', { name: 'Mesas', exact: true }).click();
    await page.getByRole('button', { name: 'Ver bloqueos de mesa T-1', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Bloqueos de mesa T-1', exact: true });
    await expect(panel.getByText('No hay bloqueos en esta mesa', { exact: true })).toBeVisible();
    expect((await availability()).slots.length).toBeGreaterThan(0);
    let form = await prepareBlock(page, `${date}T23:30`, `${date}T22:00`, 'Mantenimiento nocturno');
    await form.getByRole('button', { name: 'Revisar bloqueo', exact: true }).click();
    await expect(
      form.getByText('El fin debe ser posterior al inicio.', { exact: true }),
    ).toBeVisible();
    await form.getByLabel('Fin del bloqueo').fill(`${following}T01:00`);
    await form.getByLabel('Motivo del bloqueo').fill('');
    await form.getByRole('button', { name: 'Revisar bloqueo', exact: true }).click();
    await expect(
      form.getByText('El motivo debe tener al menos 3 caracteres', { exact: true }),
    ).toBeVisible();
    await form.getByLabel('Motivo del bloqueo').fill('Mantenimiento nocturno');
    await submitBlock(page);
    await expect(form).toHaveCount(0, { timeout: 20000 });
    const stored = await db.tableBlock.findFirstOrThrow({
      where: { tableId: table.id, reason: 'Mantenimiento nocturno' },
    });
    expect(stored.startAt.toISOString()).toBe(`${following}T02:30:00.000Z`);
    expect(stored.endAt.toISOString()).toBe(`${following}T04:00:00.000Z`);
    expect((await availability()).slots.length).toBe(0);
    form = await prepareBlock(
      page,
      `${date}T23:45`,
      `${following}T00:45`,
      'Solapamiento rechazado',
    );
    await submitBlock(page);
    await expect(form.getByRole('alert')).toContainText(
      'El bloqueo se superpone con otro de la mesa',
    );
    expect(await db.tableBlock.count({ where: { tableId: table.id } })).toBe(1);
    await form.getByRole('button', { name: 'Cancelar bloqueo', exact: true }).click();
    form = await prepareBlock(page, `${following}T01:00`, `${following}T02:00`, 'Extremo contiguo');
    await submitBlock(page);
    await expect(form).toHaveCount(0);
    await db.restaurantTable.update({ where: { id: table.id }, data: { tableStatus: 'BLOCKED' } });
    for (const reason of ['Mantenimiento nocturno', 'Extremo contiguo']) {
      await panel.getByRole('button', { name: `Retirar bloqueo ${reason}`, exact: true }).click();
      await panel.getByRole('button', { name: 'Confirmar retirada', exact: true }).click();
      await expect(
        panel.getByRole('group', { name: 'Confirmar retirada', exact: true }),
      ).toHaveCount(0);
    }
    expect(
      (await db.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).tableStatus,
    ).toBe('BLOCKED');
    expect((await availability()).slots.length).toBe(0);
    expect(
      (
        await request.delete(`${root}/${stored.id}`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ).status(),
    ).toBe(404);
    await panel.getByRole('button', { name: 'Cerrar bloqueos', exact: true }).click();
    await page.getByRole('button', { name: 'Editar mesa T-1', exact: true }).click();
    const tableForm = page.getByRole('form', { name: 'Editar mesa T-1', exact: true });
    await tableForm.getByLabel('Estado de la mesa').selectOption('ACTIVE');
    await tableForm.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
    await expect(tableForm).toHaveCount(0);
    expect((await availability()).slots.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Ver bloqueos de mesa T-1', exact: true }).click();
    const reservation = await db.reservation.create({
      data: {
        userId: customer.id,
        branchId: branch.id,
        tableId: table.id,
        serviceDate: date,
        partySize: 2,
        startAt: new Date(`${following}T01:00:00Z`),
        endAt: new Date(`${following}T03:00:00Z`),
      },
    });
    form = await prepareBlock(page, `${date}T22:30`, `${date}T23:30`, 'Reserva protegida');
    await submitBlock(page);
    await expect(form.getByRole('alert')).toContainText(
      'El bloqueo entra en conflicto con una reserva vigente',
    );
    expect((await db.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
      'CONFIRMED',
    );
    await form.getByRole('button', { name: 'Cancelar bloqueo', exact: true }).click();
    await db.reservation.delete({ where: { id: reservation.id } });
    form = await prepareBlock(page, `${date}T23:00`, `${following}T00:00`, 'Respuesta incierta');
    await page.route(`**${root}`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.abort('failed');
    });
    await submitBlock(page);
    await expect(
      form.getByText('No pudimos confirmar si se creó el bloqueo', { exact: true }),
    ).toBeVisible();
    await expect(
      form.getByRole('button', { name: 'Confirmar bloqueo', exact: true }),
    ).toBeDisabled();
    await form.getByRole('button', { name: 'Cerrar y revisar bloqueos', exact: true }).click();
    expect(
      await db.tableBlock.count({ where: { tableId: table.id, reason: 'Respuesta incierta' } }),
    ).toBe(1);
    await page.unroute(`**${root}`);
    const farDate = nextDate(date, 30);
    await db.tableBlock.createMany({
      data: Array.from({ length: 11 }, (_, index) => ({
        tableId: table.id,
        reason: `Intervalo temporal ${index}`,
        startAt: new Date(`${nextDate(farDate, index)}T15:00:00Z`),
        endAt: new Date(`${nextDate(farDate, index)}T16:00:00Z`),
      })),
    });
    await panel.getByRole('button', { name: 'Actualizar bloqueos', exact: true }).click();
    await expect(panel.getByText('Página 1 de 2', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(panel.getByRole('listitem')).toHaveCount(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('bloqueos.png'), fullPage: true });
    await page.reload();
    await page.getByRole('button', { name: 'Ver bloqueos de mesa T-1', exact: true }).click();
    await expect(panel.getByText('Motivo: Respuesta incierta', { exact: true })).toBeVisible();
    const foreignBlock = await db.tableBlock.create({
      data: {
        tableId: foreignTable.id,
        startAt: new Date(`${following}T01:00:00Z`),
        endAt: new Date(`${following}T03:00:00Z`),
        reason: 'Otra sucursal',
      },
    });
    expect(
      (
        await request.get(`/api/v1/staff/branches/${other.id}/tables/${foreignTable.id}/blocks`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.get(`/api/v1/staff/branches/${branch.id}/tables/${foreignTable.id}/blocks`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.delete(`${root}/${foreignBlock.id}`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ).status(),
    ).toBe(404);
    expect(await db.tableBlock.count({ where: { id: foreignBlock.id } })).toBe(1);
    await logout(page, 'STAFF');
    await login(page, admin.email);
    await page.goto(`/mesas?sucursal=${inactive.id}`);
    await page.getByRole('button', { name: 'Ver bloqueos de mesa T-3', exact: true }).click();
    form = await prepareBlock(
      page,
      `${date}T22:00`,
      `${following}T02:00`,
      'Preparación de sucursal inactiva',
    );
    await submitBlock(page);
    await expect(form).toHaveCount(0);
    expect((await db.branch.findUniqueOrThrow({ where: { id: inactive.id } })).isActive).toBe(
      false,
    );
    await logout(page, 'ADMIN');
    const customerToken = await login(page, customer.email);
    await page.goto('/mesas');
    await expect(
      page.getByText('Tu cuenta no tiene acceso a esta sección', { exact: true }),
    ).toBeVisible();
    expect(
      (await request.get(root, { headers: { Authorization: `Bearer ${customerToken}` } })).status(),
    ).toBe(403);
  } finally {
    await db.branch.deleteMany({ where: { id: { in: branchIds } } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.$disconnect();
  }
});
