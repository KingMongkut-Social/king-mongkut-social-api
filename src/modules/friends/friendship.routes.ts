import { Router } from 'express';
import { requireCompleteProfile } from '../../common/middleware/require-complete-profile.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { validate } from '../../common/middleware/validate.js';
import * as friendController from './friendship.controller.js';
import {
  requestParamsSchema, respondRequestSchema, searchUsersQuerySchema, sendRequestSchema,
  suggestionsQuerySchema, targetUserParamsSchema,
} from './friendship.schemas.js';

const router = Router();

router.use(authenticate, requireCompleteProfile);

router.get('/', asyncHandler(friendController.listFriends));
router.get('/requests', asyncHandler(friendController.listRequests));
router.get('/suggestions', validate({ query: suggestionsQuerySchema }), asyncHandler(friendController.listSuggestions));
router.get('/search', validate({ query: searchUsersQuerySchema }), asyncHandler(friendController.searchUsers));
router.get('/users/:userId', validate({ params: targetUserParamsSchema }), asyncHandler(friendController.getUserConnection));
router.post('/request', validate({ body: sendRequestSchema }), asyncHandler(friendController.sendRequest));
router.post('/respond', validate({ body: respondRequestSchema }), asyncHandler(friendController.respondRequest));
router.delete('/requests/:requestId', validate({ params: requestParamsSchema }), asyncHandler(friendController.cancelRequest));
router.delete('/:requestId', validate({ params: requestParamsSchema }), asyncHandler(friendController.removeFriend));

export const friendshipRoutes = router;
