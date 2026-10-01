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
const chatImageSchema = z.string().trim().regex(
  /^\/api\/v1\/chats\/uploads\/[a-f0-9-]{36}\.(jpg|png|gif|webp|avif)$/,
  'Expected a chat image upload URL',
);

const chatMessageBodySchema = z.object({
  content: z.string().trim().max(4000).default(''),
  images: z.array(chatImageSchema).max(4).default([]),
}).refine((value) => value.content.length > 0 || value.images.length > 0, {
  message: 'A message must contain text or an image',
});

export const sendMessageSchema = chatMessageBodySchema;
export const socketSendSchema = chatMessageBodySchema.extend({ chatId: objectIdSchema });
