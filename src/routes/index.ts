import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { postRouter } from '../modules/posts/post.routes.js';
import { friendshipRoutes } from '../modules/friends/friendship.routes.js';
import { chatRouter } from '../modules/chats/chat.routes.js';
import { profileRouter } from '../modules/users/profile.routes.js';
import { notificationRouter } from '../modules/notifications/notification.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/posts', postRouter);
apiRouter.use('/friends', friendshipRoutes);
apiRouter.use('/chats', chatRouter);
apiRouter.use('/users', profileRouter);
apiRouter.use('/notifications', notificationRouter);
