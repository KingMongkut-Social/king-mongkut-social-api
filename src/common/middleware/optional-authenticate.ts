import type { RequestHandler } from 'express';
import { currentUser } from '../../modules/auth/auth.service.js';
import { hasCompleteProfile } from '../../modules/users/user.model.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';

export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = await verifyAccessToken(authorization.slice('Bearer '.length));
    const user = await currentUser(payload.sub);
    if (hasCompleteProfile(user)) {
      req.auth = { userId: user.id, role: user.role, needsProfileCompletion: false };
    }
    next();
  } catch (error) {
    next(error);
  }
};
