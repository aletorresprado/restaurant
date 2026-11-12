import { defineConfig } from '@playwright/test';

// Dedicated ports/processes: do not consume real local quotas or reuse a server without CSP.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['security.spec.ts', 'account-login-limit.spec.ts', 'account-actions.spec.ts', 'customer.spec.ts', 'branches.spec.ts'],
  timeout: 60000,
  expect: { timeout: 15000 }, // Allow the API's 15-second request window on this local PostgreSQL environment.
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5180', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    { command: 'node dist/main.js', cwd: '../api', url: 'http://127.0.0.1:3002/api/v1/health',
      env: { PORT: '3002', NODE_ENV: 'development',
        WEB_ORIGINS: 'http://127.0.0.1:5180,http://127.0.0.1:5181',
        RATE_LIMIT_LOGIN: '10000', RATE_LIMIT_REGISTER: '10000', RATE_LIMIT_REFRESH: '10000',
        RATE_LIMIT_WRITE: '10000', RATE_LIMIT_READ: '10000',
        LOGIN_ACCOUNT_FAILURES: '5', LOGIN_ACCOUNT_PAUSE_SECONDS: '60',
        RATE_LIMIT_ACCOUNT_REQUEST: '10000', RATE_LIMIT_ACCOUNT_CONFIRM: '10000',
        MAIL_MODE: 'file', MAIL_OUTBOX_DIR: '.local/security-mail', PUBLIC_WEB_URL: 'http://127.0.0.1:5180' }, reuseExistingServer: false },
    { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5180 --strictPort',
      cwd: '.', url: 'http://127.0.0.1:5180', env: { API_PROXY_TARGET: 'http://127.0.0.1:3002' }, reuseExistingServer: false },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5181 --strictPort',
      cwd: '.', url: 'http://127.0.0.1:5181', env: { API_PROXY_TARGET: 'http://127.0.0.1:3002' }, reuseExistingServer: false },
  ],
});
