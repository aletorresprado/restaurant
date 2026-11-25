import { validateEnvironment } from './environment';
import { describe, it, expect } from '@jest/globals';

describe('environment configuration', () => {
  const valid = { DATABASE_URL: 'postgresql://user:password@localhost:5432/resto', JWT_ACCESS_SECRET: 'a'.repeat(64) };
  it('validates queue keys and requires the worker and an explicit key in production', () => {
    expect(validateEnvironment(valid).MAIL_QUEUE_ENABLED).toBe(true);
    expect(() => validateEnvironment({ ...valid, MAIL_QUEUE_KEY: 'weak' })).toThrow();
    expect(validateEnvironment(valid).MAIL_QUEUE_SCOPE).toBe('main');
    expect(() => validateEnvironment({ ...valid, MAIL_QUEUE_SCOPE: 'invalid scope' })).toThrow();
    expect(() => validateEnvironment({ ...valid, MAIL_QUEUE_ENABLED: 'yes' })).toThrow();
    expect(() => validateEnvironment({ ...valid, NODE_ENV: 'production', MAIL_QUEUE_ENABLED: 'false' })).toThrow();
  });
  it('bounds local mailbox retention to whole days between one and thirty', () => {
    expect(validateEnvironment(valid).MAIL_LOCAL_RETENTION_DAYS).toBe(7);
    expect(validateEnvironment({ ...valid, MAIL_LOCAL_RETENTION_DAYS: '1' }).MAIL_LOCAL_RETENTION_DAYS).toBe(1);
    for (const days of [0, 31, 1.5, 'invalid'])
      expect(() => validateEnvironment({ ...valid, MAIL_LOCAL_RETENTION_DAYS: days })).toThrow();
  });
  it('validates maintenance switches, cadence and batch bounds', () => {
    expect(validateEnvironment(valid).MAINTENANCE_ENABLED).toBe(true);
    expect(validateEnvironment({ ...valid, MAINTENANCE_ENABLED: 'false' }).MAINTENANCE_ENABLED).toBe(false);
    expect(() => validateEnvironment({ ...valid, MAINTENANCE_ENABLED: '0' })).toThrow();
    expect(() => validateEnvironment({ ...valid, MAINTENANCE_INTERVAL_SECONDS: 59 })).toThrow();
    expect(() => validateEnvironment({ ...valid, MAINTENANCE_BATCH_SIZE: 1001 })).toThrow();
  });
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
      MAIL_QUEUE_KEY: 'ab'.repeat(32), SMTP_USER: 'test', SMTP_PASSWORD: 'test-only', MAIL_FROM: 'resto@example.invalid' }).WEB_ORIGINS)
      .toEqual(['https://example.com']);
  });
});
