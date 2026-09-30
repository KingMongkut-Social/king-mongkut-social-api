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
export const sendMessageSchema = z.object({ content: z.string().trim().min(1).max(4000) });
export const socketSendSchema = z.object({ chatId: objectIdSchema, content: z.string().trim().min(1).max(4000) });
