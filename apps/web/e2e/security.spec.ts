import { expect, test } from '@playwright/test';

test('built web blocks inline scripts and foreign connections; Swagger remains functional', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__violations = [];
    document.addEventListener('securitypolicyviolation', event => {
      (window as any).__violations.push(event.effectiveDirective);
    });
  });
  const response = await page.goto('/');
  const policy = response?.headers()['content-security-policy'] ?? '';
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain('unsafe-inline');
  expect(policy).not.toContain('unsafe-eval');
  await expect(page.getByRole('heading', { name: 'Tu mesa, sin vueltas.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
  await page.evaluate(async () => {
    const script = document.createElement('script');
    script.textContent = 'window.__inlineExecuted = true';
    document.head.appendChild(script);
    await fetch('https://example.invalid/csp-test').catch(() => {});
  });
  await expect.poll(() => page.evaluate(() => (window as any).__violations)).toEqual(
    expect.arrayContaining(['script-src-elem', 'connect-src']),
  );
  expect(await page.evaluate(() => (window as any).__inlineExecuted)).toBeUndefined();
  const swagger = await page.goto('http://127.0.0.1:3002/api/docs');
  expect(swagger?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.getByRole('heading', { name: 'App Resto API', exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Authorize', exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
});

test('development web still starts with React refresh and HMR policy', async ({ page }) => {
  const response = await page.goto('http://127.0.0.1:5181/');
  expect(response?.headers()['content-security-policy']).toContain('ws://127.0.0.1:*');
  await expect(page.getByRole('heading', { name: 'Tu mesa, sin vueltas.' })).toBeVisible();
});
