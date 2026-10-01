import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const groupParamsSchema = z.object({ id: objectIdSchema });
export const groupInviteParamsSchema = z.object({ inviteId: objectIdSchema });
export const groupListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  university: z.enum(['KMITL', 'KMUTT', 'KMUTNB']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const groupMembersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).default(''),
  privacy: z.enum(['public', 'private']).default('public'),
  university: z.enum(['KMITL', 'KMUTT', 'KMUTNB']).nullable().optional(),
});
export const updateGroupSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
}).refine((value) => value.name !== undefined || value.description !== undefined, {
  message: 'At least one group field is required',
});

export const createGroupPostSchema = z.object({
  content: z.string().trim().min(1).max(20000),
  mentions: z.array(objectIdSchema).max(20).default([]),
});

export const createGroupInviteSchema = z.object({
  userId: objectIdSchema,
});
export const respondGroupInviteSchema = z.object({
  action: z.enum(['accept', 'reject']),
});
