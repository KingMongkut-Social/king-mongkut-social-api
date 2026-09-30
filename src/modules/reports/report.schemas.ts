import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const reportParamsSchema = z.object({ id: objectIdSchema });
export const createReportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user', 'group']),
  targetId: objectIdSchema,
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'fake_account', 'scam', 'other']),
  details: z.string().trim().max(2000).default(''),
});
export const listReportsQuerySchema = z.object({
  status: z.enum(['pending', 'resolved', 'dismissed']).default('pending'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export const moderateReportSchema = z.object({
  action: z.enum(['dismiss', 'remove_content', 'suspend_user', 'restore_user']),
  note: z.string().trim().max(2000).optional(),
});
