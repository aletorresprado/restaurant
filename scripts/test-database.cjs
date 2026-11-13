const { existsSync } = require('node:fs');
const path = require('node:path');

const isCI = () => ['true', '1'].includes(process.env.CI);
function assertTestDatabase(connection = process.env.DATABASE_URL, ci = isCI(), mode = process.env.NODE_ENV ?? 'development') {
  let target;
  try { target = new URL(connection); } catch { throw new Error('Configurar una base de pruebas local valida; no se muestra la conexion.'); }
  const allowedName = ci ? /^\/app_resto_ci(?:_[a-f0-9]{8})?$/.test(target.pathname) : target.pathname === '/app_resto_dev';
  if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !allowedName || mode !== 'development')
    throw new Error('Pruebas: solo PostgreSQL de desarrollo local, o base app_resto_ci aislada en CI; nunca produccion.');
  return target;
}

function loadTestEnvironment() {
  const environment = path.resolve(__dirname, '../apps/api/.env');
  if (!isCI() && existsSync(environment)) process.loadEnvFile(environment);
  return assertTestDatabase();
}

module.exports = { isCI, assertTestDatabase, loadTestEnvironment };
