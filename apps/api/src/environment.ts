import { z } from 'zod';

export function validateEnvironment(input: Record<string, unknown>) {
  return z.object({
    DATABASE_URL: z.string().url().refine(v => /^postgres(ql)?:/.test(v)),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().regex(/^[1-9]\d{0,5}[smhd]$/).default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().regex(/^[1-9]\d{0,5}[smhd]$/).default('7d'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  }).passthrough().parse(input);
}
