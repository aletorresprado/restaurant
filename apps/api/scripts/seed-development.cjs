// Explicit, repeatable local setup. Never runs when starting the API.
const { existsSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');

if (existsSync('.env')) process.loadEnvFile('.env');
const branchId = '4d04db20-58b2-4bfa-98cb-cc1a3575d028';
async function main() {
  const target = new URL(process.env.DATABASE_URL ?? '');
  if ((process.env.NODE_ENV ?? 'development') !== 'development' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      target.pathname !== '/app_resto_dev') {
    throw new Error('Este comando solo admite NODE_ENV=development y la base local app_resto_dev.');
  }
  const db = new PrismaClient();
  try {
    const branch = await db.branch.upsert({
      where: { id: branchId },
      update: {}, // Preserve any subsequent manual edits, including deactivation.
      create: {
        id: branchId,
        name: 'Sucursal de prueba — Desarrollo',
        address: 'Dirección ficticia 123 (solo pruebas locales)',
        tables: { create: [
          { tableNumber: 'D-1', capacity: 2 },
          { tableNumber: 'D-2', capacity: 4 },
          { tableNumber: 'D-3', capacity: 6 },
        ] },
        schedules: { create: Array.from({ length: 7 }, (_, index) => ({
          dayOfWeek: index + 1, openingTime: '12:00', closingTime: '02:00', reservationIntervalMinutes: 30,
        })) },
      },
      include: { _count: { select: { tables: true, schedules: true } } },
    });
    console.log(`Datos locales disponibles: ${branch.name}`);
    console.log(`Mesas: ${branch._count.tables}. Horarios semanales: ${branch._count.schedules}.`);
    console.log('No se crean cuentas ni se modifican datos existentes.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
