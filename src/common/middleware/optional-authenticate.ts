import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../../modules/auth/token.service.js';

export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = await verifyAccessToken(authorization.slice('Bearer '.length));
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch (error) {
    next(error);
  }
};
