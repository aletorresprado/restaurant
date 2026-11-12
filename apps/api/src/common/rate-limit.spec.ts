import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { RateLimitMiddleware } from './rate-limit';

describe('rate limits', () => {
  afterEach(() => { jest.restoreAllMocks(); });
  const middleware = () => new RateLimitMiddleware(new ConfigService({ RATE_LIMIT_LOGIN: 2, RATE_LIMIT_WRITE: 2,
    RATE_LIMIT_REGISTER: 2, RATE_LIMIT_REFRESH: 2, RATE_LIMIT_READ: 2 }));
  function call(limiter: RateLimitMiddleware, path: string, method = 'POST', ip = '127.0.0.1') {
    const next = jest.fn();
    const response = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    limiter.use({ originalUrl: path, method, ip, socket: {}, headers: { 'x-forwarded-for': Math.random().toString() } } as any,
      response as any, next);
    return { next, ...response };
  }
  it('shares web/Bearer login quotas, counts malformed and successful attempts, ignores forwarded headers', () => {
    const limiter = middleware();
    expect(call(limiter, '/api/v1/auth/login').next).toHaveBeenCalled();
    expect(call(limiter, '/api/v1/AUTH/WEB/LOGIN/').next).toHaveBeenCalled();
    const blocked = call(limiter, '/api/v1/auth/login');
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(blocked.setHeader).toHaveBeenCalledWith('Retry-After', '900');
    expect(blocked.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED', retryAfter: 900 }));
  });
  it('does not extend a blocked window; permits retry at expiry and isolates addresses', () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const limiter = middleware();
    call(limiter, '/api/v1/auth/login'); call(limiter, '/api/v1/auth/login');
    now += 5000;
    expect(call(limiter, '/api/v1/auth/login').setHeader).toHaveBeenCalledWith('Retry-After', '895');
    expect(call(limiter, '/api/v1/auth/login', 'POST', '192.0.2.1').next).toHaveBeenCalled();
    now += 895000;
    expect(call(limiter, '/api/v1/auth/login').next).toHaveBeenCalled();
  });
  it('shares write quotas across routes and preserves logout, health, reads and preflight', () => {
    const limiter = middleware();
    call(limiter, '/api/v1/reservations'); call(limiter, '/api/v1/admin/branches');
    expect(call(limiter, '/api/v1/staff/tables', 'PATCH').status).toHaveBeenCalledWith(429);
    for (const path of ['/api/v1/auth/logout', '/api/v1/auth/web/logout', '/api/v1/health'])
      expect(call(limiter, path).next).toHaveBeenCalled();
    expect(call(limiter, '/api/v1/branches', 'GET').next).toHaveBeenCalled();
    expect(call(limiter, '/api/v1/reservations', 'OPTIONS').next).toHaveBeenCalled();
  });
  it('counts HEAD and GET together; registrations and refresh have independent groups', () => {
    const limiter = middleware();
    call(limiter, '/api/v1/branches', 'GET'); call(limiter, '/api/v1/branches', 'HEAD');
    expect(call(limiter, '/api/v1/availability', 'GET').status).toHaveBeenCalledWith(429);
    for (const group of ['register', 'refresh']) {
      expect(call(limiter, `/api/v1/auth/${group}`).next).toHaveBeenCalled();
      expect(call(limiter, `/api/v1/auth/${group === 'register' ? 'web/register' : 'refresh'}`).next).toHaveBeenCalled();
      expect(call(limiter, `/api/v1/auth/${group}`).status).toHaveBeenCalledWith(429);
    }
    expect(call(limiter, '/api/v1/auth/login').next).toHaveBeenCalled();
  });
  it('bounds memory without evicting active quotas', () => {
    const limiter = middleware();
    const buckets = (limiter as any).buckets as Map<string, unknown>;
    for (let i = 0; i < 10000; i++) buckets.set(String(i), { count: 1, expires: Date.now() + 60000 });
    expect(call(limiter, '/api/v1/branches', 'HEAD').status).toHaveBeenCalledWith(429);
    expect(buckets.size).toBe(10000);
  });
});
