import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['security.spec.ts', 'account-login-limit.spec.ts', 'account-actions.spec.ts'], // Isolated production-preview tests.
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      url: 'http://127.0.0.1:3000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: { MAINTENANCE_ENABLED: 'false', RATE_LIMIT_LOGIN: '10000', RATE_LIMIT_REGISTER: '10000',
        RATE_LIMIT_REFRESH: '10000', RATE_LIMIT_WRITE: '10000', RATE_LIMIT_READ: '10000',
        RATE_LIMIT_ACCOUNT_REQUEST: '10000', RATE_LIMIT_ACCOUNT_CONFIRM: '10000',
        MAIL_MODE: 'file', PUBLIC_WEB_URL: 'http://127.0.0.1:5173', MAIL_OUTBOX_DIR: '.local/e2e-mail' },
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
      cwd: '.',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
