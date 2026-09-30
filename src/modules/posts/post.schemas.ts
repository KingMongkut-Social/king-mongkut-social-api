import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

const assetUrlSchema = z.string().trim().min(1).max(2048).refine((value) => {
  if (/^\/api\/v1\/posts\/uploads\/[a-f0-9-]{36}\.(jpg|png|gif|webp|avif|pdf|txt|doc|docx)$/.test(value)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Expected an HTTP(S) URL or a post upload URL');

export const postIdParamsSchema = z.object({ id: objectIdSchema });
export const postCommentParamsSchema = z.object({ id: objectIdSchema, commentId: objectIdSchema });

const attachmentSchema = z.object({
  url: assetUrlSchema,
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  size: z.number().int().min(0).max(10 * 1024 * 1024),
});

const postFields = z.object({
  title: z.string().trim().max(150).optional(),
  content: z.string().trim().max(20_000).optional(),
  status: z.enum(['draft', 'published']).optional(),
  coverImage: assetUrlSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  images: z.array(assetUrlSchema).max(10).optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
  feeling: z.string().trim().max(100).nullable().optional(),
  taggedFriends: z.array(objectIdSchema).max(20).optional(),
});

export const createPostSchema = postFields.refine(
  (value) => Boolean(value.content || value.images?.length || value.attachments?.length || value.coverImage),
  { message: 'Post needs text or media' },
);

export const updatePostSchema = postFields.refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

export const listPostsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'published']).optional(),
  tag: z.string().trim().optional(),
});

export const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  parentId: objectIdSchema.nullable().optional(),
});

export const listCommentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
