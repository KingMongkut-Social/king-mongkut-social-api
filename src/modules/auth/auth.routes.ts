import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authRateLimit } from '../../common/middleware/rate-limit.js';
import { validate } from '../../common/middleware/validate.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

authRouter.post('/register', authRateLimit, validate({ body: registerSchema }), asyncHandler(controller.register));
authRouter.post('/login', authRateLimit, validate({ body: loginSchema }), asyncHandler(controller.login));
authRouter.post('/refresh', authRateLimit, asyncHandler(controller.refresh));
authRouter.post('/logout', asyncHandler(controller.logout));
authRouter.get('/me', authenticate, asyncHandler(controller.me));
