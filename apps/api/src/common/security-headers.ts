import { Request, Response, NextFunction } from 'express';

export const apiPolicy = "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'";
// Swagger's own template and components use inline styles; scripts remain same-origin only.
export const swaggerPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";

export function securityHeaders(request: Request, response: Response, next: NextFunction) {
  const swagger = /^\/api\/docs(?:\/|$)/i.test(request.originalUrl.split('?')[0]);
  response.setHeader('Content-Security-Policy', swagger ? swaggerPolicy : apiPolicy);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}
