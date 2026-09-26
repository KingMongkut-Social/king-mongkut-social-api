import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { AppError } from './common/errors/app-error.js';
import { apiRateLimit } from './common/middleware/rate-limit.js';
import { errorHandler } from './common/middleware/error-handler.js';
import { notFound } from './common/middleware/not-found.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req: { id?: unknown; method?: unknown; url?: string }) {
          return { id: req.id, method: req.method, url: req.url?.split('?')[0] };
        },
      },
      genReqId(req: express.Request, res: express.Response) {
        const supplied = req.headers['x-request-id'];
        const id = typeof supplied === 'string' && supplied.length <= 100 ? supplied : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new AppError(403, 'CORS_FORBIDDEN', 'Origin is not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(apiRateLimit);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === mongoose.ConnectionStates.connected;
    res.status(ready ? 200 : 503).json({
      success: ready,
      data: { status: ready ? 'ready' : 'not_ready' },
    });
  });

  app.use('/api/v1', apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}