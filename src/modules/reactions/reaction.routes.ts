import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './reaction.controller.js';
import { reactionBodySchema, reactionTargetParamsSchema } from './reaction.schemas.js';

export const reactionRouter = Router();

reactionRouter.use(authenticate);
reactionRouter.put(
  '/:targetType/:targetId',
  validate({ params: reactionTargetParamsSchema, body: reactionBodySchema }),
  asyncHandler(controller.set),
);
reactionRouter.delete(
  '/:targetType/:targetId',
  validate({ params: reactionTargetParamsSchema }),
  asyncHandler(controller.remove),
);
