import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { currentUser } from '../auth/auth.service.js';
import { verifyAccessToken } from '../auth/token.service.js';
import { hasCompleteProfile } from '../users/user.model.js';
import { emitPresenceUpdated, isUserOnline, setChatSocketServer } from './chat.realtime.js';
import { socketSendSchema } from './chat.schemas.js';
import { handleTyping, sendMessage } from './chat.service.js';
import { FriendshipModel } from '../friends/friendship.model.js';

function socketError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  logger.error({ err: error }, 'Chat socket error');
  return { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' };
}

async function notifyFriendsPresence(userId: string, isOnline: boolean): Promise<void> {
  try {
    const friendships = await FriendshipModel.find({
      status: 'accepted',
      $or: [{ requester: userId }, { recipient: userId }],
    }).select('requester recipient').lean();
    // A reconnect can occur while the database query is in flight.
    if (isUserOnline(userId) !== isOnline) return;
    const friendIds = [...new Set(friendships.map((friendship) =>
      String(friendship.requester) === userId ? String(friendship.recipient) : String(friendship.requester)))];
    emitPresenceUpdated(friendIds, userId, isOnline);
  } catch (error) {
    logger.error({ err: error, userId }, 'Could not notify friends of presence change');
  }
}

export function attachChatSocket(server: HttpServer): SocketServer {
  const io = new SocketServer(server, {
    cors: {
      origin(origin, callback) {
        callback(null, !origin || env.CORS_ORIGINS.includes(origin));
      },
      credentials: true,
    },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      callback(null, !origin || env.CORS_ORIGINS.includes(origin));
    },
    maxHttpBufferSize: 16 * 1024,
  });
  setChatSocketServer(io);

  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: unknown };
      const token = auth.token;
      if (typeof token !== 'string' || !token) {
        throw new AppError(401, 'UNAUTHORIZED', 'Missing access token');
      }
      const claims = await verifyAccessToken(token);
      const user = await currentUser(claims.sub);
      if (!hasCompleteProfile(user)) {
        throw new AppError(403, 'PROFILE_INCOMPLETE', 'กรุณากรอกคณะและภาควิชาก่อนใช้งาน');
      }
      Object.assign(socket.data as object, {
        userId: String(user._id),
        accessToken: token,
        expiresAt: claims.exp * 1000,
      });
      next();
    } catch (error) {
      const details = socketError(error);
      next(Object.assign(new Error(details.message), { data: { code: details.code } }));
    }
  });

  io.on('connection', (socket) => {
    const { userId, accessToken, expiresAt } = socket.data as {
      userId: string; accessToken: string; expiresAt: number;
    };
    const wasOnline = isUserOnline(userId);
    void socket.join(`user:${userId}`);
    if (!wasOnline) void notifyFriendsPresence(userId, true);
    const expiryTimer = setTimeout(() => socket.disconnect(true), Math.min(Math.max(expiresAt - Date.now(), 0), 2_147_483_647));
    expiryTimer.unref();
    socket.once('disconnect', () => {
      clearTimeout(expiryTimer);
      if (!isUserOnline(userId)) void notifyFriendsPresence(userId, false);
    });
    socket.on('chat:send', async (payload: unknown, ack?: (result: unknown) => void) => {
      try {
        const parsed = socketSendSchema.safeParse(payload);
        if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid chat message');
        await verifyAccessToken(accessToken);
        const user = await currentUser(userId);
        if (!hasCompleteProfile(user)) {
          throw new AppError(403, 'PROFILE_INCOMPLETE', 'กรุณากรอกคณะและภาควิชาก่อนใช้งาน');
        }
        const message = await sendMessage(userId, parsed.data.chatId, parsed.data.content, parsed.data.images);
        ack?.({ success: true, data: message });
      } catch (error) {
        ack?.({ success: false, error: socketError(error) });
      }
    });
    socket.on('chat:typing', async (payload: unknown) => {
      try {
        if (!payload || typeof payload !== 'object') return;
        const { chatId, isTyping } = payload as { chatId?: unknown; isTyping?: unknown };
        if (typeof chatId === 'string' && typeof isTyping === 'boolean') {
          await handleTyping(userId, chatId, isTyping);
        }
      } catch {
        // Silently ignore typing error
      }
    });
  });

  return io;
}
