import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const createDirectSchema = z.object({ userId: objectIdSchema });
export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(objectIdSchema).min(1).max(49).refine(
    (ids) => new Set(ids).size === ids.length,
    'Members must be unique',
  ),
});
export const chatIdParamsSchema = z.object({ chatId: objectIdSchema });
export const listMessagesQuerySchema = z.object({
  before: objectIdSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
const chatImageSchema = z.object({
  url: z.string().regex(/^\/api\/v1\/chats\/uploads\/[a-f0-9-]{36}\.(jpg|png|gif|webp|avif)$/),
  name: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

const messagePayloadSchema = z.object({
  content: z.string().trim().max(4000).default(''),
  image: chatImageSchema.nullable().optional(),
}).refine((value) => value.content.length > 0 || Boolean(value.image), {
  message: 'Message must contain text or an image',
});

export const sendMessageSchema = messagePayloadSchema;
export const socketSendSchema = messagePayloadSchema.extend({ chatId: objectIdSchema });
