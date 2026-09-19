import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './comment.controller.js';
import {
  commentParamsSchema,
  createCommentSchema,
  postCommentsParamsSchema,
  updateCommentSchema,
} from './comment.schemas.js';

export const commentRouter = Router({ mergeParams: true });

commentRouter.get(
  '/',
  optionalAuthenticate,
  validate({ params: postCommentsParamsSchema }),
  asyncHandler(controller.list),
);
commentRouter.post(
  '/',
  authenticate,
  validate({ params: postCommentsParamsSchema, body: createCommentSchema }),
  asyncHandler(controller.create),
);
commentRouter.patch(
  '/:commentId',
  authenticate,
  validate({ params: commentParamsSchema, body: updateCommentSchema }),
  asyncHandler(controller.update),
);
commentRouter.delete(
  '/:commentId',
  authenticate,
  validate({ params: commentParamsSchema }),
  asyncHandler(controller.remove),
);
