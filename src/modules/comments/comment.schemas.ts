import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const postCommentsParamsSchema = z.object({
  postId: objectIdSchema,
});

export const commentParamsSchema = z.object({
  postId: objectIdSchema,
  commentId: objectIdSchema,
});

export const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  parentCommentId: objectIdSchema.nullable().optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

export interface CreateCommentInput {
  content: string;
  parentCommentId?: string | null;
}

export interface UpdateCommentInput {
  content: string;
}
