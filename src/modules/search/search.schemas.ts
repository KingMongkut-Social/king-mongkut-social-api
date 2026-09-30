import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  type: z.enum(['all', 'users', 'posts', 'groups', 'universities']).default('all'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(8),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
