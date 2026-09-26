import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'accessToken',
      'refreshToken',
      'res.headers["set-cookie"]',
      'res.headers.location',
      'code',
      'id_token',
      'client_secret',
    ],
    censor: '[REDACTED]',
  },
});
