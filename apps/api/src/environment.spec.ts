import { validateEnvironment } from './environment';
import { describe, it, expect } from '@jest/globals';

describe('environment configuration', () => {
  const valid = { DATABASE_URL: 'postgresql://user:password@localhost:5432/resto', JWT_ACCESS_SECRET: 'a'.repeat(64) };
  it('keeps file delivery local and rejects incomplete SMTP configuration', () => {
    expect(() => validateEnvironment({ ...valid, PUBLIC_WEB_URL: 'https://example.com' })).toThrow();
    expect(() => validateEnvironment({ ...valid, MAIL_MODE: 'smtp' })).toThrow();
    expect(() => validateEnvironment({ ...valid, PUBLIC_WEB_URL: 'http://localhost:5173/path' })).toThrow();
    expect(validateEnvironment(valid).MAIL_MODE).toBe('file');
  });
  it('bounds rate limits and rejects blanket proxy trust', () => {
    expect(() => validateEnvironment({ ...valid, LOGIN_ACCOUNT_FAILURES: 0 })).toThrow();
    expect(() => validateEnvironment({ ...valid, LOGIN_ACCOUNT_PAUSE_SECONDS: 901 })).toThrow();
    expect(() => validateEnvironment({ ...valid, RATE_LIMIT_LOGIN: 0 })).toThrow();
    expect(() => validateEnvironment({ ...valid, RATE_LIMIT_WRITE: 10001 })).toThrow();
    expect(() => validateEnvironment({ ...valid, TRUSTED_PROXY_IPS: 'true' })).toThrow();
    expect(() => validateEnvironment({ ...valid, TRUSTED_PROXY_IPS: 'loopback' })).toThrow();
    expect(validateEnvironment({ ...valid, TRUSTED_PROXY_IPS: '127.0.0.1, ::1' }).TRUSTED_PROXY_IPS)
      .toEqual(['127.0.0.1', '::1']);
  });
  it('rejects missing configuration and weak secrets', () => {
    expect(() => validateEnvironment({})).toThrow();
    expect(() => validateEnvironment({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow();
  });
  it('rejects unsupported durations and database providers', () => {
    expect(() => validateEnvironment({ ...valid, JWT_REFRESH_EXPIRES_IN: 'forever' })).toThrow();
    expect(() => validateEnvironment({ ...valid, DATABASE_URL: 'https://example.com' })).toThrow();
  });
  it('applies defaults and validates the server port', () => {
    expect(validateEnvironment(valid).PORT).toBe(3000);
    expect(() => validateEnvironment({ ...valid, PORT: 99999 })).toThrow();
  });
  it('requires explicit HTTPS origins for production and bounds browser sessions', () => {
    expect(() => validateEnvironment({ ...valid, NODE_ENV: 'production' })).toThrow();
    expect(() => validateEnvironment({ ...valid, NODE_ENV: 'production', WEB_ORIGINS: 'http://example.com' })).toThrow();
    expect(() => validateEnvironment({ ...valid, WEB_ORIGINS: 'https://example.com/path' })).toThrow();
    expect(() => validateEnvironment({ ...valid, WEB_SESSION_HOURS: 25 })).toThrow();
    expect(validateEnvironment({ ...valid, NODE_ENV: 'production', WEB_ORIGINS: 'https://example.com',
      PUBLIC_WEB_URL: 'https://example.com', MAIL_MODE: 'smtp', SMTP_HOST: 'smtp.example.invalid',
      SMTP_USER: 'test', SMTP_PASSWORD: 'test-only', MAIL_FROM: 'resto@example.invalid' }).WEB_ORIGINS)
      .toEqual(['https://example.com']);
  });
});
