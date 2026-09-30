import { createServer, type Server } from 'node:http';
import type { Server as SocketServer } from 'socket.io';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { attachChatSocket } from './modules/chats/chat.socket.js';
import { setChatSocketServer } from './modules/chats/chat.realtime.js';

let server: Server | undefined;
let socketServer: SocketServer | undefined;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  const forceExit = setTimeout(() => {
    logger.fatal('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  if (socketServer) {
    await new Promise<void>((resolve) => socketServer!.close(() => resolve()));
  } else if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
  }
  setChatSocketServer(undefined);
  await disconnectDatabase();
  clearTimeout(forceExit);
}

async function bootstrap(): Promise<void> {
  await connectDatabase();
  const app = createApp();
  server = createServer(app);
  socketServer = attachChatSocket(server);
  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM').then(() => process.exit(0)));
process.on('SIGINT', () => void shutdown('SIGINT').then(() => process.exit(0)));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection').finally(() => process.exit(1));
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException').finally(() => process.exit(1));
});

void bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start application');
  process.exit(1);
});
