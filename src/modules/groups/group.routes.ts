import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { requireCompleteProfile } from '../../common/middleware/require-complete-profile.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './group.controller.js';
import {
  addGroupMemberSchema,
  createGroupPostSchema,
  createGroupSchema,
  groupListQuerySchema,
  groupMemberParamsSchema,
  groupParamsSchema,
  groupPostParamsSchema,
  groupUserParamsSchema,
  updateGroupMemberSchema,
} from './group.schemas.js';

export const groupRouter = Router();

groupRouter.get('/', optionalAuthenticate, validate({ query: groupListQuerySchema }), asyncHandler(controller.list));
groupRouter.get(
  '/users/:userId',
  optionalAuthenticate,
  validate({ params: groupUserParamsSchema }),
  asyncHandler(controller.userGroups),
);
groupRouter.post('/', authenticate, requireCompleteProfile, validate({ body: createGroupSchema }), asyncHandler(controller.create));
groupRouter.get('/:id', optionalAuthenticate, validate({ params: groupParamsSchema }), asyncHandler(controller.get));
groupRouter.delete('/:id', authenticate, requireCompleteProfile, validate({ params: groupParamsSchema }), asyncHandler(controller.removeGroup));
groupRouter.put('/:id/join', authenticate, requireCompleteProfile, validate({ params: groupParamsSchema }), asyncHandler(controller.join));
groupRouter.delete('/:id/join', authenticate, requireCompleteProfile, validate({ params: groupParamsSchema }), asyncHandler(controller.leave));
groupRouter.get(
  '/:id/members',
  optionalAuthenticate,
  validate({ params: groupParamsSchema, query: groupListQuerySchema.pick({ page: true, limit: true }) }),
  asyncHandler(controller.members),
);
groupRouter.post(
  '/:id/members',
  authenticate,
  requireCompleteProfile,
  validate({ params: groupParamsSchema, body: addGroupMemberSchema }),
  asyncHandler(controller.addMember),
);
groupRouter.patch(
  '/:id/members/:userId',
  authenticate,
  requireCompleteProfile,
  validate({ params: groupMemberParamsSchema, body: updateGroupMemberSchema }),
  asyncHandler(controller.updateMemberRole),
);
groupRouter.delete(
  '/:id/members/:userId',
  authenticate,
  requireCompleteProfile,
  validate({ params: groupMemberParamsSchema }),
  asyncHandler(controller.removeMember),
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
groupRouter.delete(
  '/:id/posts/:postId',
  authenticate,
  requireCompleteProfile,
  validate({ params: groupPostParamsSchema }),
  asyncHandler(controller.removePost),
);
