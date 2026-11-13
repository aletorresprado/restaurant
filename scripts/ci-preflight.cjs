const { isCI, assertTestDatabase } = require('./test-database.cjs');
const { createRequire } = require('node:module');
const path = require('node:path');
const apiRequire = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client');

async function main() {
  if (!isCI()) throw new Error('Este chequeo requiere CI=true y una base aislada.');
  assertTestDatabase();
  const db = new PrismaClient();
  try {
    const [role] = await db.$queryRaw`SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
    if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole)
      throw new Error('CI requiere usuario sin privilegios de superusuario, creacion de bases o roles.');
    console.log('OK: base CI local aislada y usuario sin privilegios de administracion.');
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Fallo preflight CI: revisar base aislada y permisos; no se imprimen credenciales.'); process.exitCode = 1; });
