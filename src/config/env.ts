import 'dotenv/config';
import { z } from 'zod';

const durationPattern = /^\d+(ms|s|m|h|d)$/;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.url().default('http://localhost:4000/api/v1/auth/google/callback'),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().regex(durationPattern).default('15m'),
  REFRESH_TOKEN_TTL: z.string().regex(durationPattern).default('7d'),
  COOKIE_SECURE: z.string().default('false').transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.string().default('info'),
}).superRefine((value, ctx) => {
  const frontend = new URL(value.FRONTEND_URL);
  const callback = new URL(value.GOOGLE_REDIRECT_URI);
  if (!['http:', 'https:'].includes(frontend.protocol) || frontend.username || frontend.password
    || frontend.pathname !== '/' || frontend.search || frontend.hash) {
    ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'FRONTEND_URL must be an HTTP(S) origin' });
  }
  if (!['http:', 'https:'].includes(callback.protocol) || callback.username || callback.password
    || callback.pathname !== '/api/v1/auth/google/callback' || callback.search || callback.hash) {
    ctx.addIssue({ code: 'custom', path: ['GOOGLE_REDIRECT_URI'], message: 'Use the absolute Google callback URL' });
  }
  if (value.NODE_ENV === 'production' && (frontend.protocol !== 'https:' || callback.protocol !== 'https:' || !value.COOKIE_SECURE)) {
    ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Production auth requires HTTPS URLs and secure cookies' });
  }
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
