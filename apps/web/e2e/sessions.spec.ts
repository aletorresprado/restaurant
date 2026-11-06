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
  target.pathname !== '/app_resto_dev' ||
  (process.env.NODE_ENV ?? 'development') !== 'development'
)
  throw new Error('Las pruebas de sesiones solo admiten la base local app_resto_dev.');

async function login(page: Page, email: string, name: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  await expect(page.getByRole('button', { name: `Salir (${name})`, exact: true })).toBeVisible();
}

test('tabs own independent sessions; copied storage cannot rotate or revoke the original', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const target = new URL(process.env.DATABASE_URL ?? '');
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(target.hostname);
  expect(target.pathname).toBe('/app_resto_dev');
  const db = new PrismaClient();
  const ids = [randomUUID(), randomUUID()];
  const emails = ids.map((id) => `sessions-${id}@example.invalid`);
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
    await login(page, emails[0], 'Ana');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Salir (Ana)' })).toBeVisible();
    const before = await db.session.count({ where: { userId: ids[0] } });

    // Same-origin opener copies sessionStorage, reproducing browser tab duplication.
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(() => {
      window.open('/mis-reservas', '_blank');
    });
    const copied = await popupPromise;
    await expect(
      copied.getByText('Esta sesión está en uso en otra pestaña.', { exact: false }),
    ).toBeVisible();
    await expect(copied.getByRole('button', { name: 'Salir (Ana)' })).toHaveCount(0);
    expect(await db.session.count({ where: { userId: ids[0] } })).toBe(before);
    expect(await copied.evaluate(() => sessionStorage.getItem('app-resto-session-v1'))).toBeNull();
    await expect(page.getByRole('button', { name: 'Salir (Ana)' })).toBeVisible();

    await login(copied, emails[0], 'Ana');
    const unrelated = await context.newPage();
    await login(unrelated, emails[1], 'Beto');
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    const owners = await Promise.all(
      [page, copied].map((tab) =>
        tab.evaluate(() => JSON.parse(sessionStorage.getItem('app-resto-session-v1')!).ownerId),
      ),
    );
    expect(owners[0]).not.toBe(owners[1]);

    // Force simultaneous 401s from actual pages; each must rotate its own server session.
    let refreshes = 0;
    for (const tab of [page, copied]) {
      let rejected = false;
      tab.on('request', (request) => {
        if (request.url().endsWith('/auth/refresh')) refreshes++;
      });
      await tab.route('**/auth/me', async (route) => {
        if (!rejected) {
          rejected = true;
          await route.fulfill({ status: 401, json: {} });
        } else await route.continue();
      });
    }
    await Promise.all([page.reload(), copied.reload()]);
    for (const tab of [page, copied])
      await expect(tab.getByRole('button', { name: 'Salir (Ana)' })).toBeVisible();
    await expect.poll(() => refreshes).toBe(2);
    expect(await db.session.count({ where: { userId: ids[0] } })).toBe(2);

    await copied.getByRole('button', { name: 'Salir (Ana)' }).click();
    await expect(copied.getByRole('button', { name: 'Saliendo…' })).toHaveCount(0);
    await expect(copied.getByRole('button', { name: 'Salir (Ana)' })).toHaveCount(0);
    await expect.poll(() => db.session.count({ where: { userId: ids[0] } })).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Salir (Ana)' })).toBeVisible();
    await unrelated.reload();
    await expect(unrelated.getByRole('button', { name: 'Salir (Beto)' })).toBeVisible();
    await copied.close();
    await unrelated.close();
  } finally {
    await page.close();
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});

test('without Web Locks a login stays in memory and reload requires login again', async ({
  page,
}) => {
  test.setTimeout(60000);
  const db = new PrismaClient();
  const id = randomUUID();
  const email = `memory-session-${id}@example.invalid`;
  try {
    await db.user.create({
      data: {
        id,
        email,
        firstName: 'Memoria',
        lastName: 'Temporal',
        passwordHash: await bcrypt.hash('Password123', 4),
      },
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'locks', { value: undefined });
    });
    await login(page, email, 'Memoria');
    expect(await page.evaluate(() => sessionStorage.getItem('app-resto-session-v1'))).toBeNull();
    await page.reload();
    await expect(page.getByText('Ingresá para ver y gestionar tus reservas.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salir (Memoria)' })).toHaveCount(0);
  } finally {
    await page.close();
    await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
