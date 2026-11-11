import { z } from 'zod';

export function validateEnvironment(input: Record<string, unknown>) {
  const value = z.object({
    DATABASE_URL: z.string().url().refine(v => /^postgres(ql)?:/.test(v)),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().regex(/^[1-9]\d{0,5}[smhd]$/).default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().regex(/^[1-9]\d{0,5}[smhd]$/).default('7d'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    WEB_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173')
      .transform(value => value.split(',').map(origin => origin.trim()).filter(Boolean))
      .refine(origins => origins.length > 0 && origins.every(origin => {
        try { return new URL(origin).origin === origin && /^https?:/.test(origin); } catch { return false; }
      }), 'WEB_ORIGINS debe contener origenes HTTP(S) exactos separados por coma'),
    WEB_SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  }).passthrough().parse(input);
  if (value.NODE_ENV === 'production' &&
      (!input.WEB_ORIGINS || value.WEB_ORIGINS.some(origin => !origin.startsWith('https://'))))
    throw new Error('En produccion configurar WEB_ORIGINS explicitamente con HTTPS');
  return value;
}
