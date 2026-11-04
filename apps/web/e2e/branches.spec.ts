import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const bcrypt = apiRequire('bcryptjs');
const environment = fileURLToPath(new URL('../../api/.env', import.meta.url));
if (existsSync(environment)) process.loadEnvFile(environment);

test('admin creates, edits and toggles branches with reservation conflicts and uncertain creation', async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const email = `branches-${suffix}@example.invalid`;
  const name = `Sucursal web ${suffix}`;
  const branchIds: string[] = [];
  try {
    const admin = await db.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'Temporal',
        email,
        role: 'ADMIN',
        passwordHash: await bcrypt.hash('Password123', 4),
      },
    });
    await page.goto('/ingresar');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Administración', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sucursales', exact: true }).click();
    await page.getByRole('button', { name: 'Nueva sucursal', exact: true }).click();
    let form = page.getByRole('form', { name: 'Crear sucursal', exact: true });
    await form.getByRole('button', { name: 'Crear sucursal', exact: true }).click();
    await expect(form.getByText('El nombre debe tener al menos 2 caracteres')).toBeVisible();
    await form.getByLabel('Nombre de la sucursal').fill(name);
    await form.getByLabel('Dirección', { exact: true }).fill('Dirección temporal 456');
    await form.getByLabel('Teléfono (opcional)').fill('+54 381 1234567');
    await form.getByText('Coordenadas opcionales', { exact: true }).click();
    await form.getByLabel('Latitud', { exact: true }).fill('-26.8');
    await form.getByRole('button', { name: 'Crear sucursal', exact: true }).click();
    await expect(
      form.getByText('Completá latitud y longitud juntas.', { exact: true }),
    ).toBeVisible();
    await form.getByLabel('Longitud', { exact: true }).fill('-65.2');
    await form.getByLabel('Sucursal activa', { exact: true }).uncheck();
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/admin/branches') && r.request().method() === 'POST',
    );
    await form.getByRole('button', { name: 'Crear sucursal', exact: true }).click();
    const created = await (await response).json();
    branchIds.push(created.id);
    await expect(page.getByText(`Sucursal «${name}» guardada.`, { exact: true })).toBeVisible();
    expect((await request.get(`/api/v1/branches/${created.id}`)).status()).toBe(404);
    await page.getByRole('button', { name: `Editar ${name}`, exact: true }).click();
    form = page.getByRole('form', { name: 'Editar sucursal', exact: true });
    await expect(form.getByLabel('Teléfono (opcional)')).toHaveValue('+54 381 1234567');
    const editedName = `Editada ${suffix}`;
    await form.getByLabel('Nombre de la sucursal').fill(editedName);
    await form.getByLabel('Sucursal activa', { exact: true }).check();
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(
      page.getByText(`Sucursal «${editedName}» guardada.`, { exact: true }),
    ).toBeVisible();
    const visible = await request.get(`/api/v1/branches/${created.id}`);
    expect(visible.status()).toBe(200);
    expect((await visible.json()).latitude).toBe(-26.8);
    let card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: editedName, exact: true }) });
    await card
      .getByLabel(`Elegir imagen para ${editedName}`)
      .setInputFiles({
        name: 'invalida.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg></svg>'),
      });
    await expect(card.getByRole('alert')).toContainText('Elegí una imagen JPG, PNG o WebP');
    await card
      .getByLabel(`Elegir imagen para ${editedName}`)
      .setInputFiles(fileURLToPath(new URL('../src/assets/hero.jpg', import.meta.url)));
    await card.getByRole('button', { name: 'Guardar imagen', exact: true }).click();
    await expect(
      card.getByText('Imagen guardada. Ya se muestra en el inicio.', { exact: true }),
    ).toBeVisible();
    const firstVersion = (await db.branch.findUniqueOrThrow({ where: { id: created.id } }))
      .imageVersion;
    expect(firstVersion).toBeTruthy();
    await page.goto('/');
    const homePhoto = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: editedName, exact: true }) })
      .locator('img');
    await expect(homePhoto).toHaveAttribute('src', new RegExp(`/branches/${created.id}/image`));
    await expect
      .poll(() => homePhoto.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await page.reload();
    await expect(homePhoto).toHaveAttribute('src', new RegExp(firstVersion));
    await page.goto('/administracion');
    await page.getByRole('button', { name: 'Sucursales', exact: true }).click();
    card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: editedName, exact: true }) });
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=',
      'base64',
    );
    await card
      .getByLabel(`Elegir imagen para ${editedName}`)
      .setInputFiles({ name: 'reemplazo.png', mimeType: 'image/png', buffer: png });
    await card.getByRole('button', { name: 'Guardar imagen', exact: true }).click();
    await expect(
      card.getByText('Imagen guardada. Ya se muestra en el inicio.', { exact: true }),
    ).toBeVisible();
    expect(
      (await db.branch.findUniqueOrThrow({ where: { id: created.id } })).imageVersion,
    ).not.toBe(firstVersion);
    const table = await db.restaurantTable.create({
      data: { branchId: created.id, tableNumber: 'W-1', capacity: 4 },
    });
    const reservation = await db.reservation.create({
      data: {
        userId: admin.id,
        branchId: created.id,
        tableId: table.id,
        partySize: 2,
        serviceDate: '2026-12-01',
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 93600000),
      },
    });
    await page.getByRole('button', { name: `Editar ${editedName}`, exact: true }).click();
    form = page.getByRole('form', { name: 'Editar sucursal', exact: true });
    await form.getByLabel('Sucursal activa', { exact: true }).uncheck();
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(form.getByText('Confirmá la desactivación', { exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Confirmar desactivación', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('La sucursal tiene reservas vigentes');
    expect((await db.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
      'CONFIRMED',
    );
    expect((await db.branch.findUniqueOrThrow({ where: { id: created.id } })).isActive).toBe(true);
    await db.reservation.delete({ where: { id: reservation.id } });
    await form.getByRole('button', { name: 'Confirmar desactivación', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect((await request.get(`/api/v1/branches/${created.id}`)).status()).toBe(404);
    expect((await request.get(`/api/v1/branches/${created.id}/image`)).status()).toBe(404);
    await expect
      .poll(() =>
        card
          .getByRole('img', { name: `Vista previa de ${editedName}` })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: `Editar ${editedName}`, exact: true }).click();
    form = page.getByRole('form', { name: 'Editar sucursal', exact: true });
    await form.getByLabel('Sucursal activa', { exact: true }).check();
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect((await request.get(`/api/v1/branches/${created.id}`)).status()).toBe(200);
    await card.getByRole('button', { name: 'Quitar imagen', exact: true }).click();
    await card.getByRole('button', { name: 'Confirmar quitar imagen', exact: true }).click();
    await expect(
      card.getByText('Imagen quitada. Se usará la imagen general.', { exact: true }),
    ).toBeVisible();
    expect((await db.branch.findUniqueOrThrow({ where: { id: created.id } })).imageVersion).toBe(
      null,
    );
    await page.getByRole('button', { name: 'Nueva sucursal', exact: true }).click();
    form = page.getByRole('form', { name: 'Crear sucursal', exact: true });
    const uncertainName = `Respuesta perdida ${suffix}`;
    await form.getByLabel('Nombre de la sucursal').fill(uncertainName);
    await form.getByLabel('Dirección', { exact: true }).fill('Dirección incierta 789');
    await page.route('**/api/v1/admin/branches', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const result = await route.fetch();
      branchIds.push((await result.json()).id);
      await route.abort('failed');
    });
    await form.getByRole('button', { name: 'Crear sucursal', exact: true }).click();
    await expect(form.getByText('No pudimos confirmar si se creó', { exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Crear sucursal', exact: true })).toBeDisabled();
    await form.getByRole('button', { name: 'Cerrar y revisar sucursales', exact: true }).click();
    await expect(page.getByRole('heading', { name: uncertainName, exact: true })).toBeVisible();
    expect(await db.branch.count({ where: { name: uncertainName } })).toBe(1);
    await page.unroute('**/api/v1/admin/branches');
    await page.reload();
    await page.getByRole('button', { name: 'Sucursales', exact: true }).click();
    await expect(page.getByRole('heading', { name: editedName, exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('sucursales.png'), fullPage: true });
  } finally {
    await db.branch.deleteMany({ where: { id: { in: branchIds } } });
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});
