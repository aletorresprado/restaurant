import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const bcrypt = apiRequire('bcryptjs');
const testDatabase = apiRequire('../../scripts/test-database.cjs');
testDatabase.loadTestEnvironment();

test('verifies email and recovers a password from private local mail without leaking or reusing the link', async ({ page, context }) => {
  const db = new PrismaClient();
  const email = `email-web-${randomUUID()}@example.invalid`;
  let id: string | undefined;
  async function link(route: string) {
    const directory = fileURLToPath(new URL('../../api/.local/security-mail', import.meta.url));
    let found = '';
    await expect.poll(async () => {
      const files = await readdir(directory).catch(() => []);
      for (const file of files.sort()) {
        const mail = await readFile(path.join(directory, file), 'utf8').then(JSON.parse).catch(() => null);
        if (mail?.to === email && mail.text.includes(`/${route}#token=`))
          found = mail.text.match(/http[^\s]+/)[0];
      }
      return !!found;
    }).toBe(true);
    return found;
  }
  try {
    const user = await db.user.create({ data: { email, firstName: 'Correo', lastName: 'Prueba',
      passwordHash: await bcrypt.hash('Password123', 12) } });
    id = user.id;
    await page.goto('/ingresar');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('Password123');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible();
    await page.getByRole('link', { name: 'Enviar enlace de verificación' }).click();
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByText('Solicitud recibida', { exact: true })).toBeVisible();
    const verify = await link('verificar-correo');
    const action = await context.newPage();
    const requested: string[] = [];
    action.on('request', request => requested.push(request.url()));
    await action.goto(verify);
    await expect(action.getByRole('heading', { name: 'Confirmá tu correo' })).toBeVisible();
    expect(new URL(action.url()).hash).toBe('');
    expect(await db.user.findUniqueOrThrow({ where: { id } }).then((value: any) => value.emailVerifiedAt)).toBeNull();
    await action.getByRole('button', { name: 'Confirmar correo' }).click();
    await expect(action.getByText('Correo verificado. Gracias por confirmar.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Enviar enlace de verificación' })).toHaveCount(0);
    await page.goto('/recuperar');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByText('Solicitud recibida', { exact: true })).toBeVisible();
    const reset = await link('restablecer');
    await action.goto(reset);
    await expect(action.getByRole('heading', { name: 'Elegí tu nueva contraseña' })).toBeVisible();
    expect(new URL(action.url()).hash).toBe('');
    await action.getByLabel('Nueva contraseña', { exact: true }).fill('NewPassword123');
    await action.getByLabel('Confirmar contraseña', { exact: true }).fill('NewPassword123');
    await action.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(action.getByText('Contraseña actualizada. Ingresá nuevamente.')).toBeVisible();
    expect(await db.session.count({ where: { userId: id } })).toBe(0);
    expect(requested.some(url => url.includes('#token=') || url.includes('?token='))).toBe(false);
    await action.goto(reset);
    await action.getByLabel('Nueva contraseña', { exact: true }).fill('AnotherPassword123');
    await action.getByLabel('Confirmar contraseña', { exact: true }).fill('AnotherPassword123');
    await action.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(action.getByText('El enlace no es válido o venció. Solicitá uno nuevo.')).toBeVisible();
    await page.goto('/ingresar');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('NewPassword123');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible();
  } finally {
    if (id) await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
