import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const bcrypt = apiRequire('bcryptjs');
const environment = fileURLToPath(new URL('../../api/.env', import.meta.url));
if (existsSync(environment)) process.loadEnvFile(environment);

test('five wrong passwords pause web login without creating a session or deactivating the account', async ({ page }) => {
  const db = new PrismaClient();
  const email = `login-pause-${randomUUID()}@example.invalid`;
  let id: string | undefined;
  try {
    const user = await db.user.create({ data: { email, firstName: 'Pausa', lastName: 'Prueba',
      passwordHash: await bcrypt.hash('Password123', 12) } });
    id = user.id;
    await page.goto('/ingresar');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('Incorrect1');
    for (let i = 0; i < 5; i++) {
      const response = page.waitForResponse(value => value.url().endsWith('/auth/web/login') && value.request().method() === 'POST');
      await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
      expect((await response).status()).toBe(401);
      await expect(page.getByText('Credenciales inválidas', { exact: true })).toBeVisible();
    }
    await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
    const response = page.waitForResponse(value => value.url().endsWith('/auth/web/login') && value.request().method() === 'POST');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    expect((await response).status()).toBe(429);
    await expect(page.getByText(/Demasiados intentos de ingreso\. Esperá \d+ segundos/)).toBeVisible();
    expect(await db.session.count({ where: { userId: id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  } finally {
    if (id) await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
