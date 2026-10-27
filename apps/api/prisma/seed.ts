import { PrismaClient } from '@prisma/client';
import { RegisterSchema } from '@repo/validation';
import * as bcrypt from 'bcryptjs';
import { existsSync } from 'fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const db = new PrismaClient();
async function main() {
  const input = RegisterSchema.parse({
    firstName: 'Administrador', lastName: 'Restaurante',
    email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
  });
  const email = input.email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email } })) {
    throw new Error('El correo ya existe; el seed no modifica cuentas existentes.');
  }
  await db.user.create({ data: {
    email, firstName: input.firstName, lastName: input.lastName,
    passwordHash: await bcrypt.hash(input.password, 12), role: 'ADMIN',
  } });
  console.log('Administrador creado.');
}
main().catch(() => {
  console.error('No se pudo crear el administrador. Revisá ADMIN_EMAIL, ADMIN_PASSWORD y la conexión; el correo no debe existir.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
