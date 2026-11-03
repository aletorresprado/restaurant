import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const bcrypt = apiRequire('bcryptjs');
const { formatInTimeZone } = apiRequire('date-fns-tz');
const { BUSINESS_CONFIG } = apiRequire('@repo/config');
const environment = fileURLToPath(new URL('../../api/.env', import.meta.url));
if (existsSync(environment)) process.loadEnvFile(environment);

async function login(page: Page, email: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
}
async function selectUser(page: Page, email: string) {
  for (let n = 0; n < 30; n++) {
    const section = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Usuarios', exact: true }) });
    await expect(section.getByRole('button', { name: 'Anterior', exact: true })).toBeVisible();
    const button = section.getByRole('button').filter({ hasText: email });
    if (await button.count()) {
      await button.click();
      return;
    }
    await section.getByRole('button', { name: 'Siguiente', exact: true }).click();
  }
  throw new Error('No se encontró el usuario temporal en la paginación');
}

test('staff operates assigned agenda and admin audits points with safe retry', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const emails = ['staff', 'admin', 'customer'].map((role) => `${role}-${suffix}@example.invalid`);
  const branchIds: string[] = [];
  try {
    const passwordHash = await bcrypt.hash('Password123', 4);
    const users = [];
    for (const [index, role] of ['STAFF', 'ADMIN', 'CUSTOMER'].entries())
      users.push(
        await db.user.create({
          data: { email: emails[index], firstName: role, lastName: 'Temporal', passwordHash, role },
        }),
      );
    const [staff, admin, customer] = users;
    const branch = await db.branch.create({
      data: {
        name: `Gestión ${suffix}`,
        address: 'Dirección temporal 123',
        staff: { create: { userId: staff.id } },
        tables: {
          create: ['A', 'N', 'C'].map((letter) => ({ tableNumber: `W-${letter}`, capacity: 4 })),
        },
      },
      include: { tables: true },
    });
    branchIds.push(branch.id);
    const other = await db.branch.create({
      data: { name: `No asignada ${suffix}`, address: 'Otra dirección temporal 123' },
    });
    branchIds.push(other.id);
    const serviceDate = formatInTimeZone(new Date(), BUSINESS_CONFIG.timezone, 'yyyy-MM-dd');
    const reservations = [];
    for (const [index, letter] of ['A', 'N', 'C'].entries()) {
      const startAt = new Date(Date.now() + (index === 2 ? 3600000 : -3600000));
      reservations.push(
        await db.reservation.create({
          data: {
            userId: customer.id,
            branchId: branch.id,
            tableId: branch.tables.find(
              (t: { tableNumber: string }) => t.tableNumber === `W-${letter}`,
            ).id,
            serviceDate,
            partySize: 2,
            startAt,
            endAt: new Date(startAt.getTime() + 7200000),
            events: { create: { type: 'RESERVATION_CREATED', actorId: customer.id } },
          },
        }),
      );
    }
    await login(page, staff.email);
    await expect(page.getByRole('heading', { name: 'Agenda del restaurante' })).toBeVisible();
    await expect(page.getByLabel('Sucursal de la agenda')).toHaveValue(branch.id);
    expect(
      await page.getByLabel('Sucursal de la agenda').locator('option').allTextContents(),
    ).toEqual([branch.name]);
    const attended = page.getByRole('article').filter({ hasText: 'Mesa W-A' });
    await attended.getByRole('button', { name: 'Registrar asistencia', exact: true }).click();
    await attended.getByRole('button', { name: 'Confirmar resultado', exact: true }).click();
    await expect(attended.getByText('Asistencia registrada', { exact: true })).toBeVisible();
    expect(
      await db.loyaltyMovement.count({ where: { sourceKey: `attendance:${reservations[0].id}` } }),
    ).toBe(1);
    const absent = page.getByRole('article').filter({ hasText: 'Mesa W-N' });
    await absent.getByRole('button', { name: 'Registrar ausencia', exact: true }).click();
    await absent.getByRole('button', { name: 'Confirmar resultado', exact: true }).click();
    await expect(absent.getByText('Ausencia registrada', { exact: true })).toBeVisible();
    const cancelled = page.getByRole('article').filter({ hasText: 'Mesa W-C' });
    await expect(
      cancelled.getByRole('button', { name: 'Registrar asistencia', exact: true }),
    ).toBeDisabled();
    await cancelled.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
    await cancelled.getByLabel('Motivo obligatorio').fill('Cancelación de prueba del restaurante');
    await cancelled.getByRole('button', { name: 'Confirmar resultado', exact: true }).click();
    await expect(
      cancelled.getByText('Cancelada por el restaurante', { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('agenda.png'), fullPage: true });
    await page.goto('/administracion');
    await expect(
      page.getByText('Tu cuenta no tiene acceso a esta sección', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Salir (STAFF)' }).click();
    await login(page, admin.email);
    await expect(page.getByRole('heading', { name: 'Administración', exact: true })).toBeVisible();
    await selectUser(page, customer.email);
    await expect(page.getByText('0 puntos · Nivel WHITE', { exact: true })).toBeVisible();
    await page.getByLabel('Puntos del ajuste').fill('5');
    await page.getByLabel('Motivo del ajuste').fill('Ajuste auditado desde navegador');
    await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
    await page.route('**/api/v1/admin/users/*/loyalty/adjustments', async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('No pudimos conectar');
    expect(
      await db.loyaltyMovement.count({ where: { userId: customer.id, kind: 'ADJUSTMENT' } }),
    ).toBe(1);
    await page.unroute('**/api/v1/admin/users/*/loyalty/adjustments');
    await page.reload();
    await selectUser(page, customer.email);
    await expect(page.getByLabel('Puntos del ajuste')).toHaveValue('5');
    await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
    await expect(
      page.getByText('Ajuste registrado: +5 puntos. Saldo resultante: 5.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('5 puntos · Nivel BRONZE', { exact: true })).toBeVisible();
    expect(
      await db.loyaltyMovement.count({ where: { userId: customer.id, kind: 'ADJUSTMENT' } }),
    ).toBe(1);
    await page.getByRole('button', { name: 'Habilitar como personal', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar cambio de rol', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sucursales del personal' })).toBeVisible();
    const assignment = page
      .locator('div.rounded-xl')
      .filter({ has: page.getByText(branch.name, { exact: true }) })
      .last();
    await assignment.getByRole('button', { name: 'Asignar sucursal', exact: true }).click();
    await expect(
      assignment.getByRole('button', { name: 'Retirar asignación', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar a cliente', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar cambio de rol', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Habilitar como personal', exact: true }),
    ).toBeVisible();
    expect(await db.branchStaff.count({ where: { userId: customer.id } })).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('administracion.png'), fullPage: true });
    await page.getByRole('button', { name: 'Salir (ADMIN)' }).click();
    await login(page, customer.email);
    await expect(page.getByRole('heading', { name: 'Mis reservas', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Agenda', exact: true })).toHaveCount(0);
    await page.goto('/personal');
    await expect(
      page.getByText('Tu cuenta no tiene acceso a esta sección', { exact: true }),
    ).toBeVisible();
  } finally {
    await db.branch.deleteMany({ where: { id: { in: branchIds } } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.$disconnect();
  }
});
