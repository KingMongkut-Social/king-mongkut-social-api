import { Router } from 'express';
import { requireCompleteProfile } from '../../common/middleware/require-complete-profile.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './post.controller.js';
import { createPostSchema, listPostsQuerySchema, postIdParamsSchema, updatePostSchema } from './post.schemas.js';

export const postRouter = Router();

postRouter.get('/', validate({ query: listPostsQuerySchema }), asyncHandler(controller.list));
postRouter.get('/mine', authenticate, requireCompleteProfile, validate({ query: listPostsQuerySchema }), asyncHandler(controller.mine));
postRouter.get('/:id', optionalAuthenticate, validate({ params: postIdParamsSchema }), asyncHandler(controller.getById));
postRouter.post('/', authenticate, requireCompleteProfile, validate({ body: createPostSchema }), asyncHandler(controller.create));
postRouter.patch('/:id', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema, body: updatePostSchema }), asyncHandler(controller.update));
postRouter.delete('/:id', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema }), asyncHandler(controller.remove));
