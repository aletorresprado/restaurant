const { existsSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { RegisterSchema } = require('@repo/validation');

async function resetLocalPassword(db, email, password) {
  const input = RegisterSchema.pick({ email: true, password: true }).parse({ email, password });
  const passwordHash = await bcrypt.hash(input.password, 12);
  await db.$transaction(async tx => {
    const users = await tx.$queryRaw`SELECT id FROM "User" WHERE email = ${input.email.trim().toLowerCase()} FOR UPDATE`;
    if (users.length !== 1) throw new Error('No existe una cuenta con ese correo.');
    const userId = users[0].id;
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId } });
  });
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const target = new URL(process.env.DATABASE_URL ?? '');
  if ((process.env.NODE_ENV ?? 'development') !== 'development' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      target.pathname !== '/app_resto_dev') {
    throw new Error('Solo se admite la base local app_resto_dev en development.');
  }
  const db = new PrismaClient();
  try {
    await resetLocalPassword(db, process.env.LOCAL_RESET_EMAIL, process.env.LOCAL_RESET_PASSWORD);
    console.log('Contrasena actualizada. Reservas, puntos y rol conservados. Sesiones de renovacion eliminadas.');
    console.log('Los access tokens emitidos siguen vigentes hasta su vencimiento. Volve a iniciar sesion.');
  } finally { await db.$disconnect(); }
}

if (require.main === module) main().catch(() => {
  console.error('No se pudo restablecer. Revisa correo existente, base local y contrasena (8 caracteres, mayuscula, numero; maximo 72 bytes).');
  process.exitCode = 1;
});
module.exports = { resetLocalPassword };
