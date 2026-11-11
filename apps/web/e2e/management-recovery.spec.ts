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
const target = new URL(process.env.DATABASE_URL ?? '');
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  target.pathname !== '/app_resto_dev'
)
  throw new Error('Estas pruebas requieren PostgreSQL local app_resto_dev.');
async function login(page: Page, email: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Administración', exact: true })).toBeVisible();
}
async function selectCustomer(page: Page, email: string) {
  await page.goto('/administracion');
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
  throw new Error('Cliente temporal no encontrado');
}
const loyalty = (page: Page) =>
  page.getByRole('heading', { name: 'Puntos y movimientos', exact: true }).locator('..');
test('management recovers lost creates and shares adjustment review across tabs without duplicate points', async ({
  page,
  context,
}, info) => {
  test.setTimeout(150000);
  const db = new PrismaClient();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const emails = ids.map((id) => `management-recovery-${id}@example.invalid`);
  const name = `Recuperada ${randomUUID()}`;
  let branchId: string | undefined;
  let copy: Page | undefined;
  let unrelated: Page | undefined;
  try {
    const passwordHash = await bcrypt.hash('Password123', 4);
    for (const [index, id] of ids.entries())
      await db.user.create({
        data: {
          id,
          email: emails[index],
          firstName: index === 1 ? 'Cliente' : 'Admin',
          lastName: 'Temporal',
          passwordHash,
          role: index === 1 ? 'CUSTOMER' : 'ADMIN',
        },
      });
    await login(page, emails[0]);
    await page.getByRole('button', { name: 'Sucursales', exact: true }).click();
    await page.getByRole('button', { name: 'Nueva sucursal', exact: true }).click();
    const form = page.getByRole('form', { name: 'Crear sucursal', exact: true });
    await form.getByLabel('Nombre de la sucursal').fill(name);
    await form.getByLabel('Dirección', { exact: true }).fill('Temporal recuperacion 123');
    let posts = 0,
      originalKey = '';
    await page.route('**/api/v1/admin/branches', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts++;
      originalKey = route.request().headers()['idempotency-key'];
      const response = await route.fetch();
      branchId = (await response.json()).id;
      await route.abort('failed');
    });
    await form.getByRole('button', { name: 'Crear sucursal', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('No pudimos conectar');
    expect(await db.branch.count({ where: { name } })).toBe(1);
    expect(originalKey).toMatch(/^[0-9a-f-]{36}$/);
    await page.reload();
    expect(posts).toBe(1);
    await page.unroute('**/api/v1/admin/branches');
    unrelated = await context.newPage();
    await login(unrelated, emails[2]);
    await expect(unrelated.getByLabel('Recuperar operaciones')).toHaveCount(0);
    copy = await context.newPage();
    await login(copy, emails[0]);
    for (const tab of [page, copy]) {
      await tab.locator('summary').filter({ hasText: 'Operaciones pendientes' }).click();
      await expect(
        tab.getByRole('article', { name: 'Alta de sucursal', exact: true }),
      ).toContainText(name);
    }
    await page.screenshot({ path: info.outputPath('operaciones-pendientes.png'), fullPage: true });
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    for (const tab of [page, copy])
      await tab.route('**/api/v1/admin/branches', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        expect(route.request().headers()['idempotency-key']).toBe(originalKey);
        arrivals++;
        if (arrivals === 2) release();
        await gate;
        await route.continue();
      });
    await Promise.all(
      [page, copy].map((tab) =>
        tab
          .getByRole('article', { name: 'Alta de sucursal', exact: true })
          .getByRole('button', { name: 'Verificar y reintentar' })
          .click(),
      ),
    );
    for (const tab of [page, copy]) {
      await expect(
        tab.getByText('Alta de sucursal: resultado recuperado. Actualizamos los listados.'),
      ).toBeVisible();
      await tab.unroute('**/api/v1/admin/branches');
    }
    expect(await db.branch.count({ where: { name } })).toBe(1);
    await page.goto('/mesas');
    await page.getByLabel('Sucursal de las mesas').selectOption(branchId!);
    await page.getByRole('button', { name: 'Nueva mesa', exact: true }).click();
    const tableForm = page.getByRole('form', { name: 'Crear mesa', exact: true });
    await tableForm.getByLabel('Número de mesa').fill('REC-1');
    const tablePath = `**/api/v1/staff/branches/${branchId}/tables`;
    await page.route(tablePath, (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
    );
    await tableForm.getByRole('button', { name: 'Crear mesa', exact: true }).click();
    await expect(tableForm.getByRole('alert')).toContainText('No pudimos conectar');
    expect(await db.restaurantTable.count({ where: { branchId } })).toBe(0);
    await page.reload();
    await page.unroute(tablePath);
    await page.locator('summary').filter({ hasText: 'Operaciones pendientes' }).click();
    await page
      .getByRole('article', { name: 'Alta de mesa', exact: true })
      .getByRole('button', { name: 'Verificar y reintentar' })
      .click();
    await expect.poll(() => db.restaurantTable.count({ where: { branchId } })).toBe(1);
    for (const tab of [page, copy]) await selectCustomer(tab, emails[1]);
    await loyalty(page).getByLabel('Puntos del ajuste').fill('5');
    await loyalty(page).getByLabel('Motivo del ajuste').fill('Reconocimiento entre pestanas');
    await loyalty(page).getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
    await expect(loyalty(copy).getByLabel('Puntos del ajuste')).toHaveValue('5');
    await expect(loyalty(copy).getByLabel('Puntos del ajuste')).toBeDisabled();
    await loyalty(copy).getByRole('button', { name: 'Volver a editar', exact: true }).click();
    await expect(
      loyalty(page).getByRole('button', { name: 'Revisar ajuste', exact: true }),
    ).toBeVisible();
    await loyalty(page).getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
    const pointsPath = `**/api/v1/admin/users/${ids[1]}/loyalty/adjustments`;
    await page.route(pointsPath, async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    await loyalty(page).getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
    await expect(loyalty(page).getByRole('alert')).toContainText('No pudimos conectar');
    expect((await db.user.findUniqueOrThrow({ where: { id: ids[1] } })).loyaltyBalance).toBe(5);
    await page.reload();
    await page.unroute(pointsPath);
    await selectCustomer(page, emails[1]);
    await expect(loyalty(page).getByLabel('Puntos del ajuste')).toHaveValue('5');
    let pointArrivals = 0;
    let releasePoints!: () => void;
    const pointsGate = new Promise<void>((resolve) => {
      releasePoints = resolve;
    });
    for (const tab of [page, copy])
      await tab.route(pointsPath, async (route) => {
        pointArrivals++;
        if (pointArrivals === 2) releasePoints();
        await pointsGate;
        await route.continue();
      });
    await Promise.all(
      [page, copy].map((tab) =>
        loyalty(tab).getByRole('button', { name: 'Confirmar ajuste', exact: true }).click(),
      ),
    );
    for (const tab of [page, copy])
      await expect(
        loyalty(tab).getByText('Ajuste registrado: +5 puntos. Saldo resultante: 5.', {
          exact: true,
        }),
      ).toBeVisible();
    expect(await db.loyaltyMovement.count({ where: { userId: ids[1] } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: ids[1] } })).loyaltyBalance).toBe(5);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) => key.startsWith('app-resto-management:')),
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await copy?.close();
    await unrelated?.close();
    await page.close();
    if (branchId) await db.branch.deleteMany({ where: { id: branchId } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
