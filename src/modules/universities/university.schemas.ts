import { z } from 'zod';

export const universityCodeSchema = z.enum(['KMITL', 'KMUTT', 'KMUTNB']);
export const universityParamsSchema = z.object({ code: universityCodeSchema });
export const universityListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'published']).optional(),
  tag: z.string().trim().optional(),
});
export type UniversityCode = z.infer<typeof universityCodeSchema>;
