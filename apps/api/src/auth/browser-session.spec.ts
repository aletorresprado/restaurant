import { describe, it, expect } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { BrowserSessionPolicy } from './browser-session';

describe('browser cookie policy', () => {
  it('uses host-only, Secure and HttpOnly cookies in production without persistent expiry', () => {
    const config = { get: (key: string) => ({ NODE_ENV: 'production', WEB_ORIGINS: ['https://resto.example'] } as Record<string, unknown>)[key] } as ConfigService;
    const policy = new BrowserSessionPolicy(config);
    expect(policy.cookieName('tab')).toBe('__Host-resto-web-tab');
    expect(policy.options()).toEqual({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
  });
  it('permits only exact trusted mutation origins with a tab header', () => {
    const policy = new BrowserSessionPolicy(new ConfigService({ WEB_ORIGINS: ['https://resto.example'] }));
    const request: any = { method: 'POST', headers: { origin: 'https://resto.example', 'x-web-session': 'a3f2ec06-9f9e-41c6-8fd3-169b3482c411' } };
    expect(policy.tab(request)).toBe(request.headers['x-web-session']);
    expect(() => policy.tab({ ...request, headers: { ...request.headers, origin: 'https://resto.example.evil' } })).toThrow();
    expect(() => policy.tab({ ...request, headers: { ...request.headers, 'sec-fetch-site': 'cross-site' } })).toThrow();
  });
});
