import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const groupParamsSchema = z.object({ id: objectIdSchema });
export const groupMemberParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
export const groupPostParamsSchema = z.object({ id: objectIdSchema, postId: objectIdSchema });
export const groupUserParamsSchema = z.object({ userId: objectIdSchema });

export const groupListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  university: z.enum(['KMITL', 'KMUTT', 'KMUTNB']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).default(''),
  privacy: z.enum(['public', 'private']).default('public'),
  university: z.enum(['KMITL', 'KMUTT', 'KMUTNB']).nullable().optional(),
});

export const createGroupPostSchema = z.object({
  content: z.string().trim().min(1).max(20000),
});

export const addGroupMemberSchema = z.object({
  userId: objectIdSchema,
});

export const updateGroupMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'moderator', 'member']),
});
