import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as friendController from './friendship.controller.js';
import {
  respondFriendRequestSchema,
  searchUsersQuerySchema,
  sendFriendRequestSchema,
} from './friendship.schemas.js';

const router = Router();

router.use(authenticate);

router.get('/search', validate({ query: searchUsersQuerySchema }), asyncHandler(friendController.searchUsers));
router.post('/request', validate({ body: sendFriendRequestSchema }), asyncHandler(friendController.sendRequest));
router.post('/respond', validate({ body: respondFriendRequestSchema }), asyncHandler(friendController.respondRequest));

export const friendshipRoutes = router;
