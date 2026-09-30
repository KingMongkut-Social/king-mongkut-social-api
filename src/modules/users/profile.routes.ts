import { Router } from 'express';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { profileUploadRateLimit } from '../../common/middleware/rate-limit.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './profile.controller.js';
import { editProfileSchema, profileFriendsQuerySchema, profileParamsSchema, profilePostsQuerySchema } from './profile.schemas.js';
import { serveProfileImage, uploadProfileImage } from './profile-upload.js';

export const profileRouter = Router();

profileRouter.get('/uploads/:filename', serveProfileImage);
profileRouter.patch('/me/profile', authenticate, validate({ body: editProfileSchema }), asyncHandler(controller.editMe));
profileRouter.post('/me/avatar', authenticate, profileUploadRateLimit, uploadProfileImage('avatar'));
profileRouter.delete('/me/avatar', authenticate, asyncHandler(controller.clearAvatar));
profileRouter.post('/me/cover', authenticate, profileUploadRateLimit, uploadProfileImage('cover'));
profileRouter.delete('/me/cover', authenticate, asyncHandler(controller.clearCover));
profileRouter.get('/:userId/profile', optionalAuthenticate, validate({ params: profileParamsSchema }), asyncHandler(controller.getProfile));
profileRouter.get('/:userId/posts', optionalAuthenticate, validate({ params: profileParamsSchema, query: profilePostsQuerySchema }), asyncHandler(controller.getPosts));
profileRouter.get('/:userId/friends', optionalAuthenticate, validate({ params: profileParamsSchema, query: profileFriendsQuerySchema }), asyncHandler(controller.getFriends));
