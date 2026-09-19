import 'dotenv/config';
import { z } from 'zod';

const durationPattern = /^\d+(ms|s|m|h|d)$/;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().regex(durationPattern).default('15m'),
  REFRESH_TOKEN_TTL: z.string().regex(durationPattern).default('7d'),
  COOKIE_SECURE: z.string().default('false').transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.string().default('info'),
  GOOGLE_CLIENT_ID: z.string().trim().default(''),
  GOOGLE_CLIENT_SECRET: z.string().trim().default(''),
}).superRefine((value, ctx) => {
  if (value.ACCESS_TOKEN_SECRET === value.REFRESH_TOKEN_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['REFRESH_TOKEN_SECRET'],
      message: 'Refresh token secret must differ from access token secret',
    });
  }
  if (value.NODE_ENV === 'production' && value.COOKIE_SAME_SITE === 'none' && !value.COOKIE_SECURE) {
    ctx.addIssue({
      code: 'custom',
      path: ['COOKIE_SECURE'],
      message: 'COOKIE_SECURE must be true when SameSite=None in production',
    });
  }
  if (Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_CLIENT_SECRET'],
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must either both be set or both be empty',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
};
