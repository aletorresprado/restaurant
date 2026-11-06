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

async function login(page: Page, email: string, navigate = true) {
  if (navigate) await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
  const response = page.waitForResponse((response) => response.url().endsWith('/auth/login'));
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  return (await (await response).json()).accessToken as string;
}
async function logout(page: Page, name: string) {
  await page.getByRole('button', { name: `Salir (${name})`, exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ingresar', exact: true }).first()).toBeVisible();
}

test('tables respect branch roles, availability, live reservations and uncertain creation', async ({
  page,
  request,
}, info) => {
  test.setTimeout(120000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const emails = ['staff', 'admin', 'customer'].map(
    (role) => `tables-${role}-${suffix}@example.invalid`,
  );
  const branchIds: string[] = [];
  try {
    const hash = await bcrypt.hash('Password123', 4);
    const users = [];
    for (const [index, role] of ['STAFF', 'ADMIN', 'CUSTOMER'].entries())
      users.push(
        await db.user.create({
          data: {
            email: emails[index],
            firstName: role,
            lastName: 'Temporal',
            passwordHash: hash,
            role,
          },
        }),
      );
    const [staff, admin, customer] = users;
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const branch = await db.branch.create({
      data: {
        name: `Mesas principal ${suffix.slice(0, 8)}`,
        address: 'Dirección temporal 123',
        staff: { create: { userId: staff.id } },
        exceptions: { create: { date, openingTime: '18:00', closingTime: '23:00' } },
      },
    });
    branchIds.push(branch.id);
    const other = await db.branch.create({
      data: { name: `No asignada ${suffix.slice(0, 8)}`, address: 'Otra dirección temporal 123' },
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
    const foreignTable = await db.restaurantTable.create({
      data: { branchId: other.id, tableNumber: 'B-1', capacity: 4 },
    });
    await page.goto('/mesas');
    await page.getByRole('main').getByRole('link', { name: 'Ingresar', exact: true }).click();
    const staffToken = await login(page, staff.email, false);
    await expect(page.getByRole('heading', { name: 'Mesas', exact: true })).toBeVisible();
    await expect(page.getByLabel('Sucursal de las mesas')).toHaveValue(branch.id);
    expect(
      await page
        .getByLabel('Sucursal de las mesas')
        .locator('option:not([disabled])')
        .allTextContents(),
    ).toEqual([branch.name]);
    await expect(
      page.getByText('Todavía no hay mesas en esta sucursal', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Nueva mesa', exact: true }).click();
    let form = page.getByRole('form', { name: 'Crear mesa', exact: true });
    await form.getByLabel('Capacidad de la mesa').fill('51');
    await form.getByRole('button', { name: 'Crear mesa', exact: true }).click();
    await expect(
      form.getByText('La capacidad máxima es 50 personas', { exact: true }),
    ).toBeVisible();
    await form.getByLabel('Número de mesa').fill('A-1');
    await form.getByLabel('Capacidad de la mesa').fill('4');
    await form.getByRole('button', { name: 'Crear mesa', exact: true }).click();
    await expect(page.getByText('Mesa A-1 guardada.', { exact: true })).toBeVisible();
    let saved = await db.restaurantTable.findUniqueOrThrow({
      where: { branchId_tableNumber: { branchId: branch.id, tableNumber: 'A-1' } },
    });
    expect(saved.capacity).toBe(4);
    expect(saved.tableStatus).toBe('ACTIVE');
    const availability = () =>
      request
        .get(`/api/v1/branches/${branch.id}/availability?date=${date}&partySize=2`)
        .then((r) => r.json());
    expect((await availability()).slots.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Nueva mesa', exact: true }).click();
    form = page.getByRole('form', { name: 'Crear mesa', exact: true });
    await form.getByLabel('Número de mesa').fill('A-1');
    await form.getByRole('button', { name: 'Crear mesa', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('Ya existe ese número de mesa');
    await form.getByRole('button', { name: 'Cancelar edición', exact: true }).click();
    await page.getByRole('button', { name: 'Editar mesa A-1', exact: true }).click();
    form = page.getByRole('form', { name: 'Editar mesa A-1', exact: true });
    await expect(form.getByLabel('Número de mesa', { exact: true })).toHaveCount(0);
    await form.getByLabel('Capacidad de la mesa').fill('6');
    await form.getByLabel('Estado de la mesa').selectOption('BLOCKED');
    await form.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
    await expect(form.getByText('Confirmá el cambio de estado', { exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Confirmar cambio de estado', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect((await availability()).slots.length).toBe(0);
    for (const status of ['OUT_OF_SERVICE', 'ACTIVE']) {
      await page.getByRole('button', { name: 'Editar mesa A-1', exact: true }).click();
      form = page.getByRole('form', { name: 'Editar mesa A-1', exact: true });
      await form.getByLabel('Estado de la mesa').selectOption(status);
      await form.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
      if (status !== 'ACTIVE')
        await form.getByRole('button', { name: 'Confirmar cambio de estado', exact: true }).click();
      await expect(form).toHaveCount(0);
    }
    expect((await availability()).slots.length).toBeGreaterThan(0);
    // A capacity-only edit must preserve a state changed concurrently elsewhere.
    await page.getByRole('button', { name: 'Editar mesa A-1', exact: true }).click();
    form = page.getByRole('form', { name: 'Editar mesa A-1', exact: true });
    await db.restaurantTable.update({ where: { id: saved.id }, data: { tableStatus: 'BLOCKED' } });
    await form.getByLabel('Capacidad de la mesa').fill('8');
    await form.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
    await expect(form).toHaveCount(0);
    saved = await db.restaurantTable.findUniqueOrThrow({ where: { id: saved.id } });
    expect(saved.capacity).toBe(8);
    expect(saved.tableStatus).toBe('BLOCKED');
    await page.getByRole('button', { name: 'Editar mesa A-1', exact: true }).click();
    form = page.getByRole('form', { name: 'Editar mesa A-1', exact: true });
    await form.getByLabel('Estado de la mesa').selectOption('ACTIVE');
    await form.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
    await expect(form).toHaveCount(0);
    const reservation = await db.reservation.create({
      data: {
        userId: customer.id,
        branchId: branch.id,
        tableId: saved.id,
        serviceDate: date,
        partySize: 4,
        startAt: new Date(Date.now() - 3600000),
        endAt: new Date(Date.now() + 3600000),
      },
    });
    await page.getByRole('button', { name: 'Editar mesa A-1', exact: true }).click();
    form = page.getByRole('form', { name: 'Editar mesa A-1', exact: true });
    await form.getByLabel('Capacidad de la mesa').fill('2');
    await form.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('La mesa tiene reservas confirmadas');
    expect((await db.restaurantTable.findUniqueOrThrow({ where: { id: saved.id } })).capacity).toBe(
      8,
    );
    await db.reservation.update({ where: { id: reservation.id }, data: { status: 'ATTENDED' } });
    await form.getByLabel('Capacidad de la mesa').fill('8');
    await form.getByLabel('Estado de la mesa').selectOption('OUT_OF_SERVICE');
    await form.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
    await form.getByRole('button', { name: 'Confirmar cambio de estado', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('La mesa tiene reservas confirmadas');
    expect(
      (await db.restaurantTable.findUniqueOrThrow({ where: { id: saved.id } })).tableStatus,
    ).toBe('ACTIVE');
    expect((await db.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
      'ATTENDED',
    );
    await form.getByRole('button', { name: 'Cancelar edición', exact: true }).click();
    await db.reservation.delete({ where: { id: reservation.id } });
    await page.getByRole('button', { name: 'Nueva mesa', exact: true }).click();
    form = page.getByRole('form', { name: 'Crear mesa', exact: true });
    await form.getByLabel('Número de mesa').fill('A-2');
    await page.route(`**/api/v1/staff/branches/${branch.id}/tables`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.abort('failed');
    });
    await form.getByRole('button', { name: 'Crear mesa', exact: true }).click();
    await expect(
      form.getByText('No pudimos confirmar si se creó la mesa', { exact: true }),
    ).toBeVisible();
    await expect(form.getByRole('button', { name: 'Crear mesa', exact: true })).toBeDisabled();
    await form.getByRole('button', { name: 'Cerrar y revisar mesas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mesa A-2', exact: true })).toBeVisible();
    expect(
      await db.restaurantTable.count({ where: { branchId: branch.id, tableNumber: 'A-2' } }),
    ).toBe(1);
    await page.unroute(`**/api/v1/staff/branches/${branch.id}/tables`);
    await db.restaurantTable.createMany({
      data: Array.from({ length: 11 }, (_, i) => ({
        branchId: branch.id,
        tableNumber: `P-${String(i).padStart(2, '0')}`,
        capacity: 2,
      })),
    });
    await page.getByRole('button', { name: 'Actualizar mesas', exact: true }).click();
    await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(3);
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mesa A-1', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('mesas.png'), fullPage: true });
    await page.goto(`/mesas?sucursal=${other.id}`);
    await expect(
      page.getByText('La sucursal no está disponible para tu cuenta', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await request.get(`/api/v1/staff/branches/${other.id}/tables`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.patch(`/api/v1/staff/branches/${branch.id}/tables/${foreignTable.id}`, {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: { capacity: 50 },
        })
      ).status(),
    ).toBe(404);
    await logout(page, 'STAFF');
    await login(page, admin.email);
    await page.getByRole('button', { name: 'Sucursales', exact: true }).click();
    const inactiveCard = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: inactive.name, exact: true }) });
    await inactiveCard.getByRole('link', { name: 'Gestionar mesas', exact: true }).click();
    await expect(page.getByLabel('Sucursal de las mesas')).toHaveValue(inactive.id);
    await expect(page.getByText('Sucursal inactiva', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Nueva mesa', exact: true }).click();
    form = page.getByRole('form', { name: 'Crear mesa', exact: true });
    await form.getByLabel('Número de mesa').fill('A-1');
    await form.getByRole('button', { name: 'Crear mesa', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(
      await db.restaurantTable.count({ where: { branchId: inactive.id, tableNumber: 'A-1' } }),
    ).toBe(1);
    expect((await db.branch.findUniqueOrThrow({ where: { id: inactive.id } })).isActive).toBe(
      false,
    );
    await page.getByLabel('Sucursal de las mesas').selectOption(other.id);
    await expect(page.getByRole('heading', { name: 'Mesa B-1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Editar mesa B-1', exact: true }).click();
    await page.getByLabel('Capacidad de la mesa').fill('9');
    await page.goBack();
    await expect(page.getByLabel('Sucursal de las mesas')).toHaveValue(inactive.id);
    await expect(page.getByLabel('Sucursal de las mesas')).toBeEnabled();
    await expect(page.getByRole('form')).toHaveCount(0);
    expect(
      (await db.restaurantTable.findUniqueOrThrow({ where: { id: foreignTable.id } })).capacity,
    ).toBe(4);
    await logout(page, 'ADMIN');
    const customerToken = await login(page, customer.email);
    await expect(page.getByRole('heading', { name: 'Mis reservas', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mesas', exact: true })).toHaveCount(0);
    await page.goto('/mesas');
    await expect(
      page.getByText('Tu cuenta no tiene acceso a esta sección', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await request.get(`/api/v1/staff/branches/${branch.id}/tables`, {
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
