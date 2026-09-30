import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const notificationIdParamsSchema = z.object({ id: objectIdSchema });
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  unreadOnly: z.enum(['0', '1']).optional(),
});
