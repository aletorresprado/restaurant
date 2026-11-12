import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Response } from 'express';

export class AccountLoginLimitException extends HttpException {
  constructor(readonly seconds: number) {
    super({ statusCode: 429, code: 'RATE_LIMITED', retryAfter: seconds,
      message: `Demasiados intentos de ingreso. Esperá ${seconds} segundos antes de volver a intentar.` }, 429);
  }
}

@Catch(AccountLoginLimitException)
export class AccountLoginLimitFilter implements ExceptionFilter {
  catch(error: AccountLoginLimitException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(error.seconds));
    response.setHeader('Cache-Control', 'no-store');
    response.status(429).json(error.getResponse());
  }
}

type Counter = { failures: number; expires: number; blockedUntil: number; inFlight: boolean };

/** Single-process protection. Unknown and known emails have exactly the same policy. */
@Injectable()
export class AccountLoginLimit {
  private readonly counters = new Map<string, Counter>();
  private nextSweep = 0;
  constructor(private readonly config: ConfigService) {}

  reset(email: string) {
    const key = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    const counter = this.counters.get(key);
    if (counter?.inFlight) { counter.failures = 0; counter.blockedUntil = 0; }
    else this.counters.delete(key);
  }

  async check<T>(email: string, authenticate: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (now >= this.nextSweep) {
      for (const [key, value] of this.counters)
        if (!value.inFlight && value.expires <= now && value.blockedUntil <= now) this.counters.delete(key);
      this.nextSweep = now + 60_000;
    }
    const key = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    let counter = this.counters.get(key);
    if (counter?.inFlight) throw new AccountLoginLimitException(1);
    if (counter && counter.blockedUntil > now)
      throw new AccountLoginLimitException(Math.max(1, Math.ceil((counter.blockedUntil - now) / 1000)));
    if (counter && (counter.expires <= now || counter.blockedUntil > 0)) {
      this.counters.delete(key); counter = undefined;
    }
    if (!counter) {
      if (this.counters.size >= 10_000) throw new AccountLoginLimitException(60);
      counter = { failures: 0, expires: now + 900_000, blockedUntil: 0, inFlight: false };
      this.counters.set(key, counter);
    }
    // Reserve before any await: concurrent requests cannot all bypass the failure threshold.
    counter.inFlight = true;
    try {
      const result = await authenticate();
      this.counters.delete(key);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        counter.failures++;
        if (counter.failures >= (this.config.get<number>('LOGIN_ACCOUNT_FAILURES') ?? 5))
          counter.blockedUntil = Date.now() + (this.config.get<number>('LOGIN_ACCOUNT_PAUSE_SECONDS') ?? 60) * 1000;
      }
      throw error;
    } finally {
      counter.inFlight = false;
      if (counter.failures === 0) this.counters.delete(key); // Infrastructure failures do not consume attempts.
    }
  }
}
