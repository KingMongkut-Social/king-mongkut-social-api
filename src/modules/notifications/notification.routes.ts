import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { requireCompleteProfile } from '../../common/middleware/require-complete-profile.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './notification.controller.js';
import { listNotificationsQuerySchema, notificationIdParamsSchema } from './notification.schemas.js';

export const notificationRouter = Router();
notificationRouter.use(authenticate, requireCompleteProfile);
notificationRouter.get('/', validate({ query: listNotificationsQuerySchema }), asyncHandler(controller.list));
notificationRouter.patch('/read-all', asyncHandler(controller.readAll));
notificationRouter.patch('/:id/read', validate({ params: notificationIdParamsSchema }), asyncHandler(controller.read));
