import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

type Group = 'LOGIN' | 'REGISTER' | 'REFRESH' | 'WRITE' | 'READ' | 'ACCOUNT_REQUEST' | 'ACCOUNT_CONFIRM';
type Bucket = { count: number; expires: number };
const policies: Record<Group, { limit: number; window: number }> = {
  LOGIN: { limit: 30, window: 900_000 },
  REGISTER: { limit: 10, window: 3_600_000 },
  REFRESH: { limit: 60, window: 60_000 },
  WRITE: { limit: 120, window: 60_000 },
  READ: { limit: 300, window: 60_000 },
  ACCOUNT_REQUEST: { limit: 5, window: 900_000 },
  ACCOUNT_CONFIRM: { limit: 30, window: 900_000 },
};

/** One process only. Never evict live counters to admit a new address. */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private nextSweep = 0;
  constructor(private readonly config: ConfigService) {}

  use(request: Request, response: Response, next: NextFunction) {
    // Nest/Express can strip the wildcard mount from request.path.
    const path = request.originalUrl.split('?')[0].toLowerCase().replace(/\/+$/, '');
    if (!path.startsWith('/api/v1/') || request.method === 'OPTIONS' ||
        path === '/api/v1/health') return next();
    // Logout must remain usable even when another group is exhausted.
    if (request.method === 'POST' && /^\/api\/v1\/auth\/(web\/)?logout$/.test(path)) return next();
    const auth = request.method === 'POST' && /^\/api\/v1\/auth\/(?:web\/)?(login|register|refresh)$/.exec(path);
    const account = request.method === 'POST' && /^\/api\/v1\/auth\/(forgot-password|request-email-verification|reset-password|verify-email)$/.exec(path);
    const group: Group = account ? (['forgot-password', 'request-email-verification'].includes(account[1]) ? 'ACCOUNT_REQUEST' : 'ACCOUNT_CONFIRM')
      : auth ? auth[1].toUpperCase() as Group : ['GET', 'HEAD'].includes(request.method) ? 'READ' : 'WRITE';
    const policy = policies[group];
    const limit = this.config.get<number>(`RATE_LIMIT_${group}`) ?? policy.limit;
    const now = Date.now();
    if (now >= this.nextSweep) {
      for (const [key, bucket] of this.buckets) if (bucket.expires <= now) this.buckets.delete(key);
      this.nextSweep = now + 60_000;
    }
    // req.ip is resolved by Express, never directly from a client-supplied header.
    const address = (request.ip ?? request.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/i, '');
    const key = `${group}:${createHash('sha256').update(address).digest('hex')}`;
    let bucket = this.buckets.get(key);
    if (bucket && bucket.expires <= now) { this.buckets.delete(key); bucket = undefined; }
    if (!bucket) {
      if (this.buckets.size >= 10_000) return this.reject(response, 60);
      bucket = { count: 0, expires: now + policy.window };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= limit) return this.reject(response, Math.max(1, Math.ceil((bucket.expires - now) / 1000)));
    bucket.count++;
    next();
  }

  private reject(response: Response, seconds: number) {
    response.setHeader('Retry-After', String(seconds));
    response.setHeader('Cache-Control', 'no-store');
    return response.status(429).json({ statusCode: 429, code: 'RATE_LIMITED', retryAfter: seconds,
      message: `Demasiados intentos. Esperá ${seconds} segundos antes de volver a intentar.` });
  }
}
