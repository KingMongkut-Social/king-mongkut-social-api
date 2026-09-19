import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { friendshipRoutes } from '../modules/friends/friendship.routes.js';
import { postRouter } from '../modules/posts/post.routes.js';
import { reactionRouter } from '../modules/reactions/reaction.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/posts', postRouter);
apiRouter.use('/reactions', reactionRouter);
apiRouter.use('/friends', friendshipRoutes);
