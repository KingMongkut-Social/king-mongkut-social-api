import { z } from 'zod';
import { listPostsQuerySchema } from '../posts/post.schemas.js';
import { objectIdSchema } from './user.schemas.js';

export const profileParamsSchema = z.object({ userId: objectIdSchema });

export const editProfileSchema = z.strictObject({
  name: z.string().trim().min(2).max(80).optional(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$/,
    'Username must be 3–30 letters, digits, underscores or dots').nullable().optional(),
  bio: z.string().trim().max(500).optional(),
  faculty: z.string().trim().min(1).max(150).optional(),
  department: z.string().trim().min(1).max(150).optional(),
  academicYear: z.number().int().min(1).max(8).nullable().optional(),
  avatarUrl: z.null().optional(),
  coverUrl: z.null().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const profilePostsQuerySchema = listPostsQuerySchema.omit({ status: true }).extend({
  imagesOnly: z.literal('1').optional(),
});

export const profileFriendsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ProfilePostsQuery = z.infer<typeof profilePostsQuerySchema>;
export type ProfileFriendsQuery = z.infer<typeof profileFriendsQuerySchema>;
export type EditProfileInput = z.infer<typeof editProfileSchema>;
