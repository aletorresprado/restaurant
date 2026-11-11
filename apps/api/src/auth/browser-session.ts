import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, CookieOptions } from 'express';
import { z } from 'zod';

@Injectable()
export class BrowserSessionPolicy {
  constructor(private readonly config: ConfigService) {}
  tab(request: Request): string {
    const id = z.string().uuid().safeParse(request.headers['x-web-session']);
    if (!id.success) throw new ForbiddenException('Falta el identificador de la pestaña');
    const origin = request.headers.origin;
    const configured = this.config.get<string[] | string>('WEB_ORIGINS') ??
      ['http://127.0.0.1:5173', 'http://localhost:5173'];
    const allowed = Array.isArray(configured) ? configured : configured.split(',').map(value => value.trim());
    if (request.headers['sec-fetch-site'] === 'cross-site' ||
        (origin && !allowed.includes(origin)) ||
        (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !origin))
      throw new ForbiddenException('Origen de la solicitud no permitido');
    return id.data.toLowerCase();
  }
  cookieName(tabId: string) {
    return `${this.config.get('NODE_ENV') === 'production' ? '__Host-' : ''}resto-web-${tabId}`;
  }
  options(): CookieOptions {
    const production = this.config.get('NODE_ENV') === 'production';
    return { httpOnly: true, secure: production, sameSite: 'strict', path: production ? '/' : '/api/v1' };
  }
  secret(request: Request, tabId: string) {
    const name = this.cookieName(tabId);
    const matches = (request.headers.cookie ?? '').split(';').map(value => value.trim())
      .filter(value => value.startsWith(`${name}=`));
    // Reject ambiguous cookies rather than depend on their order.
    if (matches.length !== 1) return '';
    const secret = matches[0].slice(name.length + 1);
    return /^[A-Za-z0-9_-]{64}$/.test(secret) ? secret : '';
  }
}
