import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const searchUsersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  university: z.enum(['KMITL', 'KMUTNB', 'KMUTT']).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const suggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const targetUserParamsSchema = z.object({ userId: objectIdSchema });
export const requestParamsSchema = z.object({ requestId: objectIdSchema });
export const sendRequestSchema = z.object({ targetUserId: objectIdSchema });
export const respondRequestSchema = z.object({
  requestId: objectIdSchema,
  action: z.enum(['accept', 'reject']),
});
