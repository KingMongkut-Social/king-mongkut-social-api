import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authRateLimit, googleAuthRateLimit } from '../../common/middleware/rate-limit.js';
import { validate } from '../../common/middleware/validate.js';
import { profileSchema } from './auth.schemas.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

authRouter.post('/register', controller.passwordAuthGone);
authRouter.post('/login', controller.passwordAuthGone);
authRouter.get('/google', googleAuthRateLimit, asyncHandler(controller.googleStart));
authRouter.get('/google/callback', googleAuthRateLimit, asyncHandler(controller.googleCallback));
authRouter.patch('/profile', authenticate, validate({ body: profileSchema }), asyncHandler(controller.profile));
authRouter.post('/refresh', authRateLimit, asyncHandler(controller.refresh));
authRouter.post('/logout', asyncHandler(controller.logout));
authRouter.get('/me', authenticate, asyncHandler(controller.me));
