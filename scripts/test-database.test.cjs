const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertTestDatabase, loadTestEnvironment } = require('./test-database.cjs');

test('CI admits only isolated local test database names and never the development database', () => {
  for (const name of ['app_resto_ci', 'app_resto_ci_a1b2c3d4'])
    assert.equal(assertTestDatabase(`postgresql://fixture:fixture@127.0.0.1:5432/${name}`, true).hostname, '127.0.0.1');
  for (const name of ['app_resto_dev', 'postgres', 'restaurant', 'app_resto_ci_live'])
    assert.throws(() => assertTestDatabase(`postgresql://fixture:fixture@localhost:5432/${name}`, true));
  assert.throws(() => assertTestDatabase('postgresql://fixture:fixture@example.com/app_resto_ci', true));
  assert.throws(() => assertTestDatabase('postgresql://fixture:fixture@localhost/app_resto_ci', true, 'production'));
});
test('local developer tests retain their explicit app_resto_dev guard', () => {
  assert.equal(assertTestDatabase('postgresql://fixture:fixture@localhost/app_resto_dev', false).pathname, '/app_resto_dev');
  assert.throws(() => assertTestDatabase('postgresql://fixture:fixture@localhost/app_resto_ci', false));
  assert.throws(() => assertTestDatabase('not a connection', true));
});
test('CI does not load the developer environment file', () => {
  const keys = ['CI', 'NODE_ENV', 'DATABASE_URL'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const loader = process.loadEnvFile;
  process.env.CI = 'true'; process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgresql://fixture:fixture@localhost/app_resto_ci';
  process.loadEnvFile = () => { throw new Error('Developer env must not be loaded'); };
  try { assert.equal(loadTestEnvironment().pathname, '/app_resto_ci'); }
  finally {
    process.loadEnvFile = loader;
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
