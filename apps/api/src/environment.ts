import { z } from 'zod';
import { isIP } from 'net';

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
    TRUSTED_PROXY_IPS: z.string().default('').transform(value => value.split(',').map(ip => ip.trim()).filter(Boolean))
      .refine(ips => ips.every(ip => isIP(ip) !== 0), 'TRUSTED_PROXY_IPS solo admite direcciones IP explicitas'),
    RATE_LIMIT_LOGIN: z.coerce.number().int().min(1).max(10000).default(30),
    RATE_LIMIT_REGISTER: z.coerce.number().int().min(1).max(10000).default(10),
    RATE_LIMIT_REFRESH: z.coerce.number().int().min(1).max(10000).default(60),
    RATE_LIMIT_WRITE: z.coerce.number().int().min(1).max(10000).default(120),
    RATE_LIMIT_READ: z.coerce.number().int().min(1).max(10000).default(300),
    RATE_LIMIT_ACCOUNT_REQUEST: z.coerce.number().int().min(1).max(10000).default(5),
    RATE_LIMIT_ACCOUNT_CONFIRM: z.coerce.number().int().min(1).max(10000).default(30),
    LOGIN_ACCOUNT_FAILURES: z.coerce.number().int().min(1).max(20).default(5),
    LOGIN_ACCOUNT_PAUSE_SECONDS: z.coerce.number().int().min(1).max(900).default(60),
    MAIL_MODE: z.enum(['file', 'smtp']).default('file'),
    PUBLIC_WEB_URL: z.string().url().default('http://127.0.0.1:5173')
      .refine(url => /^https?:/.test(url) && new URL(url).origin === url, 'PUBLIC_WEB_URL debe ser un origen HTTP(S) sin ruta ni barra final'),
    MAIL_OUTBOX_DIR: z.string().min(1).default('.local/mail'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().email().optional(),
    MAINTENANCE_ENABLED: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
    MAINTENANCE_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
    MAINTENANCE_BATCH_SIZE: z.coerce.number().int().min(10).max(1000).default(500),
  }).passthrough().parse(input);
  if (value.NODE_ENV === 'production' &&
      (!input.WEB_ORIGINS || value.WEB_ORIGINS.some(origin => !origin.startsWith('https://'))))
    throw new Error('En produccion configurar WEB_ORIGINS explicitamente con HTTPS');
  if (value.MAIL_MODE === 'smtp' && (!value.SMTP_HOST || !value.SMTP_USER || !value.SMTP_PASSWORD || !value.MAIL_FROM))
    throw new Error('SMTP requiere host, usuario, password y remitente');
  if (value.NODE_ENV === 'production' && (value.MAIL_MODE !== 'smtp' || !input.PUBLIC_WEB_URL ||
      !value.PUBLIC_WEB_URL.startsWith('https://') || !value.WEB_ORIGINS.includes(value.PUBLIC_WEB_URL)))
    throw new Error('Produccion requiere correo SMTP y PUBLIC_WEB_URL HTTPS permitido en WEB_ORIGINS');
  if (value.MAIL_MODE === 'file' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(value.PUBLIC_WEB_URL).hostname))
    throw new Error('El buzon de archivos solo admite enlaces locales');
  return value;
}
