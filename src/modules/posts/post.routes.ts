import { Router } from 'express';
import { requireCompleteProfile } from '../../common/middleware/require-complete-profile.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { postUploadRateLimit } from '../../common/middleware/rate-limit.js';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './post.controller.js';
import { uploadPostAsset, servePostAsset } from './post-upload.js';
import {
  createCommentSchema, createPostSchema, listCommentsQuerySchema, listPostsQuerySchema,
  postCommentParamsSchema, postIdParamsSchema, reactionSchema, updatePostSchema,
} from './post.schemas.js';

export const postRouter = Router();

postRouter.get('/', optionalAuthenticate, validate({ query: listPostsQuerySchema }), asyncHandler(controller.list));
postRouter.get('/mine', authenticate, requireCompleteProfile, validate({ query: listPostsQuerySchema }), asyncHandler(controller.mine));
postRouter.get('/bookmarks', authenticate, requireCompleteProfile, validate({ query: listPostsQuerySchema }), asyncHandler(controller.bookmarks));
postRouter.post('/uploads', authenticate, requireCompleteProfile, postUploadRateLimit, uploadPostAsset);
postRouter.get('/uploads/:filename', servePostAsset);
postRouter.get('/:id', optionalAuthenticate, validate({ params: postIdParamsSchema }), asyncHandler(controller.getById));
postRouter.post('/', authenticate, requireCompleteProfile, validate({ body: createPostSchema }), asyncHandler(controller.create));
postRouter.patch('/:id', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema, body: updatePostSchema }), asyncHandler(controller.update));
postRouter.delete('/:id', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema }), asyncHandler(controller.remove));
postRouter.put('/:id/like', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema }), asyncHandler(controller.like));
postRouter.delete('/:id/like', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema }), asyncHandler(controller.like));
postRouter.put('/:id/reaction', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema, body: reactionSchema }), asyncHandler(controller.reaction));
postRouter.delete('/:id/reaction', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema }), asyncHandler(controller.reaction));
postRouter.put('/:id/bookmark', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema }), asyncHandler(controller.bookmark));
postRouter.delete('/:id/bookmark', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema }), asyncHandler(controller.bookmark));
postRouter.get('/:id/comments', optionalAuthenticate, validate({ params: postIdParamsSchema, query: listCommentsQuerySchema }), asyncHandler(controller.comments));
postRouter.post('/:id/comments', authenticate, requireCompleteProfile, validate({ params: postIdParamsSchema, body: createCommentSchema }), asyncHandler(controller.comment));
postRouter.delete('/:id/comments/:commentId', authenticate, requireCompleteProfile, validate({ params: postCommentParamsSchema }), asyncHandler(controller.removeComment));
