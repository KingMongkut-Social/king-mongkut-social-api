import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { chatUploadRateLimit } from '../../common/middleware/rate-limit.js';
import { requireCompleteProfile } from '../../common/middleware/require-complete-profile.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './chat.controller.js';
import { serveChatImage, uploadChatImage } from './chat-upload.js';
import {
  chatIdParamsSchema, createDirectSchema, createGroupSchema, listMessagesQuerySchema, sendMessageSchema,
} from './chat.schemas.js';

export const chatRouter = Router();
chatRouter.get('/uploads/:filename', serveChatImage);
chatRouter.use(authenticate, requireCompleteProfile);
chatRouter.post('/uploads', chatUploadRateLimit, uploadChatImage);
chatRouter.get('/', asyncHandler(controller.list));
chatRouter.post('/direct', validate({ body: createDirectSchema }), asyncHandler(controller.createDirect));
chatRouter.post('/groups', validate({ body: createGroupSchema }), asyncHandler(controller.createGroup));
chatRouter.get('/:chatId/messages', validate({ params: chatIdParamsSchema, query: listMessagesQuerySchema }),
  asyncHandler(controller.messages));
chatRouter.post('/:chatId/messages', validate({ params: chatIdParamsSchema, body: sendMessageSchema }),
  asyncHandler(controller.send));
