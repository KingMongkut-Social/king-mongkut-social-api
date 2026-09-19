import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { commentRouter } from '../comments/comment.routes.js';
import * as controller from './post.controller.js';
import { createPostSchema, listPostsQuerySchema, postIdParamsSchema, updatePostSchema } from './post.schemas.js';

export const postRouter = Router();

postRouter.get('/', optionalAuthenticate, validate({ query: listPostsQuerySchema }), asyncHandler(controller.list));
postRouter.get('/mine', authenticate, validate({ query: listPostsQuerySchema }), asyncHandler(controller.mine));
postRouter.use('/:postId/comments', commentRouter);
postRouter.get('/:id', optionalAuthenticate, validate({ params: postIdParamsSchema }), asyncHandler(controller.getById));
postRouter.post('/', authenticate, validate({ body: createPostSchema }), asyncHandler(controller.create));
postRouter.patch(
  '/:id',
  authenticate,
  validate({ params: postIdParamsSchema, body: updatePostSchema }),
  asyncHandler(controller.update),
);
postRouter.delete('/:id', authenticate, validate({ params: postIdParamsSchema }), asyncHandler(controller.remove));
