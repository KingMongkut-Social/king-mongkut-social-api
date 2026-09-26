import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { currentUser } from '../../modules/auth/auth.service.js';
import { hasCompleteProfile } from '../../modules/users/user.model.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length);
    const payload = await verifyAccessToken(token);
    const user = await currentUser(payload.sub);
    req.auth = { userId: user.id, role: user.role, needsProfileCompletion: !hasCompleteProfile(user) };
    next();
  } catch (error) {
    next(error);
  }
};
