import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { requireCompleteProfile } from '../../common/middleware/require-complete-profile.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './group.controller.js';
import { createGroupInviteSchema, createGroupPostSchema, createGroupSchema, groupInviteParamsSchema, groupListQuerySchema, groupParamsSchema, respondGroupInviteSchema } from './group.schemas.js';

export const groupRouter = Router();

groupRouter.get('/', optionalAuthenticate, validate({ query: groupListQuerySchema }), asyncHandler(controller.list));
groupRouter.post('/', authenticate, requireCompleteProfile, validate({ body: createGroupSchema }), asyncHandler(controller.create));
groupRouter.get('/mine', authenticate, requireCompleteProfile, validate({ query: groupListQuerySchema.pick({ page: true, limit: true }) }), asyncHandler(controller.mine));
groupRouter.get('/invitations', authenticate, requireCompleteProfile, asyncHandler(controller.invitations));
groupRouter.patch('/invitations/:inviteId', authenticate, requireCompleteProfile, validate({ params: groupInviteParamsSchema, body: respondGroupInviteSchema }), asyncHandler(controller.respondInvitation));
groupRouter.get('/:id', optionalAuthenticate, validate({ params: groupParamsSchema }), asyncHandler(controller.get));
groupRouter.put('/:id/join', authenticate, requireCompleteProfile, validate({ params: groupParamsSchema }), asyncHandler(controller.join));
groupRouter.delete('/:id/join', authenticate, requireCompleteProfile, validate({ params: groupParamsSchema }), asyncHandler(controller.leave));
groupRouter.post('/:id/invites', authenticate, requireCompleteProfile, validate({ params: groupParamsSchema, body: createGroupInviteSchema }), asyncHandler(controller.invite));
groupRouter.get(
  '/:id/members',
  optionalAuthenticate,
  validate({ params: groupParamsSchema, query: groupListQuerySchema.pick({ page: true, limit: true }) }),
  asyncHandler(controller.members),
);
groupRouter.get(
  '/:id/posts',
  optionalAuthenticate,
  validate({ params: groupParamsSchema, query: groupListQuerySchema.pick({ page: true, limit: true }) }),
  asyncHandler(controller.posts),
);
groupRouter.post(
  '/:id/posts',
  authenticate,
  requireCompleteProfile,
  validate({ params: groupParamsSchema, body: createGroupPostSchema }),
  asyncHandler(controller.createPost),
);
