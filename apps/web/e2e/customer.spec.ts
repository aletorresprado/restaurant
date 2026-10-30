import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const environment = fileURLToPath(new URL('../../api/.env', import.meta.url));
if (existsSync(environment)) process.loadEnvFile(environment);

test('customer reserves, reloads, cancels and logs in against PostgreSQL', async ({
  page,
}, info) => {
  const db = new PrismaClient();
  const email = `web-${randomUUID()}@example.invalid`;
  const name = `Sucursal web ${randomUUID().slice(0, 8)}`;
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  let branchId: string | undefined;
  try {
    const branch = await db.branch.create({
      data: {
        name,
        address: 'Calle de prueba 123',
        phone: '+54 381 1234567',
        tables: { create: { tableNumber: 'W-1', capacity: 4 } },
        exceptions: { create: { date, openingTime: '18:00', closingTime: '02:00' } },
      },
    });
    branchId = branch.id;
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Tu mesa, sin vueltas.' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('inicio.png'), fullPage: true });
    await page.getByRole('link', { name: `Reservá en ${name}` }).click();
    await page.getByLabel('Fecha de servicio').fill(date);
    await page.getByRole('button', { name: '18:00', exact: false }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Ana');
    await page.getByLabel('Apellido', { exact: true }).fill('Perez');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Revisá y confirmá' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmá la reserva' }).click();
    await expect(
      page.getByRole('heading', { name: '¡Listo, tu mesa está reservada!' }),
    ).toBeVisible();
    expect(await db.reservation.count({ where: { branchId, status: 'CONFIRMED' } })).toBe(1);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: '¡Listo, tu mesa está reservada!' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver detalle' }).click();
    await page.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, cancelar' }).click();
    await expect(page.getByText('Cancelaste la reserva', { exact: true })).toBeVisible();
    expect(
      await db.reservation.count({ where: { branchId, status: 'CANCELLED_BY_CUSTOMER' } }),
    ).toBe(1);
    await page.getByRole('button', { name: 'Salir (Ana)' }).click();
    await page.getByRole('link', { name: 'Ingresar', exact: true }).first().click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible();
    await expect(page.getByText('Cancelada por vos', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    if (branchId) await db.branch.deleteMany({ where: { id: branchId } });
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});
