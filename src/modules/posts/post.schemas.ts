import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const postIdParamsSchema = z.object({ id: objectIdSchema });

export const createPostSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().trim().min(1).max(20_000),
  status: z.enum(['draft', 'published']).default('draft'),
});

export const updatePostSchema = createPostSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

export const listPostsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
