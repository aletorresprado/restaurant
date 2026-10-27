import { validateEnvironment } from './environment';
import { describe, it, expect } from '@jest/globals';

describe('environment configuration', () => {
  const valid = { DATABASE_URL: 'postgresql://user:password@localhost:5432/resto', JWT_ACCESS_SECRET: 'a'.repeat(64) };
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
});
