import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as friendController from './friendship.controller.js';

const router = Router();

router.use(authenticate);

router.get('/search', asyncHandler(friendController.searchUsers));
router.post('/request', asyncHandler(friendController.sendRequest));
router.post('/respond', asyncHandler(friendController.respondRequest));

export const friendshipRoutes = router;