import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const postIdParamsSchema = z.object({ id: objectIdSchema });

export const createPostSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  content: z.string().trim().min(1).max(20_000),
  status: z.enum(['draft', 'published']).default('published'),
  coverImage: z.string().url().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  publishedAt: z.coerce.date().nullable().optional(),
});

export const updatePostSchema = createPostSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

export const listPostsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'published']).optional(),
  tag: z.string().trim().optional(),
  university: z.enum(['KMITL', 'KMUTNB', 'KMUTT']).optional(),
});

export interface CreatePostInput {
  title?: string;
  content: string;
  status: 'draft' | 'published';
  coverImage?: string | null;
  tags: string[];
  publishedAt?: Date | null;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  status?: 'draft' | 'published';
  coverImage?: string | null;
  tags?: string[];
  publishedAt?: Date | null;
}

export interface ListPostsQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'draft' | 'published';
  tag?: string;
  university?: 'KMITL' | 'KMUTNB' | 'KMUTT';
}
