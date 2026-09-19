import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const searchUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  university: z.enum(['KMITL', 'KMUTNB', 'KMUTT']).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const sendFriendRequestSchema = z.object({
  targetUserId: objectIdSchema,
});

export const respondFriendRequestSchema = z.object({
  requestId: objectIdSchema,
  action: z.enum(['accept', 'reject']),
});

export type SearchUsersQueryInput = z.infer<typeof searchUsersQuerySchema>;
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
export type RespondFriendRequestInput = z.infer<typeof respondFriendRequestSchema>;
