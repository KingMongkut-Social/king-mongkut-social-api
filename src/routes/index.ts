import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { postRouter } from '../modules/posts/post.routes.js';
import { friendshipRoutes } from '../modules/friends/friendship.routes.js';
import { chatRouter } from '../modules/chats/chat.routes.js';
import { profileRouter } from '../modules/users/profile.routes.js';
import { notificationRouter } from '../modules/notifications/notification.routes.js';
import { universityRouter } from '../modules/universities/university.routes.js';
import { groupRouter } from '../modules/groups/group.routes.js';
import { reportRouter } from '../modules/reports/report.routes.js';
import { searchRouter } from '../modules/search/search.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/posts', postRouter);
apiRouter.use('/friends', friendshipRoutes);
apiRouter.use('/chats', chatRouter);
apiRouter.use('/users', profileRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/universities', universityRouter);
apiRouter.use('/groups', groupRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/search', searchRouter);
