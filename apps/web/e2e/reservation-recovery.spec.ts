import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const bcrypt = apiRequire('bcryptjs');
const testDatabase = apiRequire('../../scripts/test-database.cjs');
testDatabase.loadTestEnvironment();

async function login(page: Page, email: string, name: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  await expect(page.getByRole('button', { name: `Salir (${name})` })).toBeVisible();
}
async function logout(page: Page, name: string) {
  await page.getByRole('button', { name: `Salir (${name})` }).click();
  await expect(page.getByRole('link', { name: 'Ingresar', exact: true }).first()).toBeVisible();
}
async function selectSlot(page: Page, branchId: string, date: string, time: string) {
  await page.goto(`/reservar?sucursal=${branchId}&fecha=${date}&personas=2`);
  await page.getByRole('button', { name: time, exact: false }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revisá y confirmá' })).toBeVisible();
}
test('lost reservation responses recover after reload and across tabs without duplicate tables', async ({
  page,
}) => {
  test.setTimeout(120000);
  const db = new PrismaClient();
  const ids = [randomUUID(), randomUUID()];
  const emails = ids.map((id) => `recovery-${id}@example.invalid`);
  const date = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  let branchId: string | undefined;
  let copied: Page | undefined;
  try {
    const passwordHash = await bcrypt.hash('Password123', 4);
    for (const [index, id] of ids.entries())
      await db.user.create({
        data: {
          id,
          email: emails[index],
          firstName: index ? 'Beto' : 'Ana',
          lastName: 'Temporal',
          passwordHash,
        },
      });
    const branch = await db.branch.create({
      data: {
        name: `Recuperacion ${randomUUID()}`,
        address: 'Temporal 123',
        tables: { create: [1, 2, 3].map((n) => ({ tableNumber: `RE-${n}`, capacity: 4 })) },
        exceptions: { create: { date, openingTime: '18:00', closingTime: '23:00' } },
      },
    });
    branchId = branch.id;
    await login(page, emails[0], 'Ana');
    await selectSlot(page, branch.id, date, '18:00');
    const popup = page.waitForEvent('popup');
    await page.evaluate(() => {
      window.open('/confirmar', '_blank');
    });
    copied = await popup;
    await expect(
      copied.getByText('Esta sesión está en uso en otra pestaña.', { exact: false }),
    ).toBeVisible();
    await login(copied, emails[0], 'Ana');
    await copied.goto('/confirmar');
    await expect(copied.getByRole('heading', { name: 'Revisá y confirmá' })).toBeVisible();
    let originalPosts = 0;
    await page.route('**/api/v1/reservations', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      originalPosts++;
      await route.fetch(); // Commit succeeds but its response is lost.
      await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Confirmá la reserva' }).click();
    await expect(page.getByText('No sabemos si la reserva llegó a confirmarse')).toBeVisible();
    expect(await db.reservation.count({ where: { branchId } })).toBe(1);
    const reservation = await db.reservation.findFirstOrThrow({ where: { branchId } });
    expect(reservation.operationId).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Verificar y reintentar' })).toBeEnabled();
    expect(originalPosts).toBe(1); // Reload does not resend a POST.
    await page.unroute('**/api/v1/reservations');
    await logout(page, 'Ana');
    await login(page, emails[1], 'Beto');
    await expect(page.getByText('Tenés una reserva por verificar', { exact: true })).toHaveCount(0);
    await logout(page, 'Beto');
    await login(page, emails[0], 'Ana');
    await page.getByRole('link', { name: 'Retomar confirmación' }).click();

    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    for (const tab of [page, copied]) {
      await tab.route('**/api/v1/reservations', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        expect(route.request().postDataJSON().operationId).toBe(reservation.operationId);
        arrivals++;
        if (arrivals === 2) release();
        await gate;
        await route.continue();
      });
    }
    await Promise.all(
      [page, copied].map((tab) =>
        tab.getByRole('button', { name: 'Verificar y reintentar' }).click(),
      ),
    );
    await expect(
      page.getByRole('heading', { name: '¡Listo, tu mesa está reservada!' }),
    ).toBeVisible();
    await expect(
      copied.getByRole('heading', { name: '¡Listo, tu mesa está reservada!' }),
    ).toBeVisible();
    expect(arrivals).toBe(2);
    expect(await db.reservation.count({ where: { branchId } })).toBe(1);
    expect(await db.reservationEvent.count({ where: { reservationId: reservation.id } })).toBe(1);
    for (const tab of [page, copied]) await tab.unroute('**/api/v1/reservations');
    await copied.goto('/confirmar');
    await expect(copied.getByRole('heading', { name: 'No hay un horario elegido' })).toBeVisible();
    expect(
      await copied.evaluate(() =>
        Object.keys(localStorage).filter((key) => key.startsWith('app-resto-reservation-intent:')),
      ),
    ).toEqual([]);

    await selectSlot(page, branch.id, date, '20:00');
    await page.route('**/api/v1/reservations', (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
    );
    await page.getByRole('button', { name: 'Confirmá la reserva' }).click();
    await expect(page.getByText('No sabemos si la reserva llegó a confirmarse')).toBeVisible();
    expect(await db.reservation.count({ where: { branchId } })).toBe(1);
    await page.reload();
    await page.unroute('**/api/v1/reservations');
    await page.getByRole('button', { name: 'Verificar y reintentar' }).click();
    await expect(
      page.getByRole('heading', { name: '¡Listo, tu mesa está reservada!' }),
    ).toBeVisible();
    expect(await db.reservation.count({ where: { branchId } })).toBe(2);
    await selectSlot(page, branch.id, date, '21:00');
    let blockedPosts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/reservations')) blockedPosts++;
    });
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error('Storage blocked');
      };
    });
    await page.getByRole('button', { name: 'Confirmá la reserva' }).click();
    await expect(page.getByRole('alert')).toContainText('almacenamiento');
    expect(blockedPosts).toBe(0);
    expect(await db.reservation.count({ where: { branchId } })).toBe(2);
  } finally {
    await copied?.close();
    await page.close();
    if (branchId) await db.branch.delete({ where: { id: branchId } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
