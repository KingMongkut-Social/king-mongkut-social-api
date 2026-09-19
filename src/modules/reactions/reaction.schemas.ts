import { z } from 'zod';
import { objectIdSchema } from '../users/user.schemas.js';

export const reactionTargetParamsSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: objectIdSchema,
});

export const reactionBodySchema = z.object({
  type: z.enum(['like', 'love', 'haha', 'wow', 'sad', 'angry']),
});

export interface ReactionTargetParams {
  targetType: 'post' | 'comment';
  targetId: string;
}

export interface ReactionBody {
  type: 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';
}
