import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { durationToMs } from '../../common/utils/duration.js';
import { env } from '../../config/env.js';
import * as authService from './auth.service.js';
import type { ProfileInput } from './auth.schemas.js';
import * as googleService from './google.service.js';
import { safeReturnTo } from './return-to.js';
import { logger } from '../../config/logger.js';

const REFRESH_COOKIE = 'refresh_token';

function getClientMeta(req: Request) {
  const userAgent = (req.headers['user-agent'] as string) || undefined;
  return { ip: req.ip, userAgent };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/v1/auth',
    maxAge: durationToMs(env.REFRESH_TOKEN_TTL),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/v1/auth',
  });
}

const OAUTH_COOKIE = 'google_oauth';
const oauthCookieOptions = {
  httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' as const,
  path: '/api/v1/auth/google',
};

function googleFailure(res: Response, error: unknown, returnTo: unknown) {
  const code = error instanceof AppError ? error.code : 'GOOGLE_LOGIN_FAILED';
  logger.warn({ authErrorCode: code }, 'Google sign-in failed');
  const url = new URL('/login', env.FRONTEND_URL);
  url.searchParams.set('error', code);
  url.searchParams.set('returnTo', safeReturnTo(returnTo));
  res.redirect(303, url.toString());
}

export async function googleStart(req: Request, res: Response) {
  try {
    const result = await googleService.startGoogleLogin(req.query.returnTo);
    res.cookie(OAUTH_COOKIE, result.binding, { ...oauthCookieOptions, maxAge: googleService.OAUTH_TTL_MS });
    res.redirect(302, result.url);
  } catch (error) {
    googleFailure(res, error, req.query.returnTo);
  }
}

export async function googleCallback(req: Request, res: Response) {
  let returnTo = '/dashboard';
  res.clearCookie(OAUTH_COOKIE, oauthCookieOptions);
  try {
    const transaction = await googleService.consumeGoogleTransaction(req.query.state, req.cookies[OAUTH_COOKIE]);
    returnTo = safeReturnTo(transaction.returnTo);
    if (req.query.error) {
      throw new AppError(400, req.query.error === 'access_denied' ? 'GOOGLE_CANCELLED' : 'GOOGLE_LOGIN_FAILED', 'Google sign-in was not completed');
    }
    const identity = await googleService.exchangeGoogleCode(req.query.code, transaction.codeVerifier, transaction.nonce);
    const result = await authService.googleLogin(identity, getClientMeta(req));
    setRefreshCookie(res, result.tokens.refreshToken);
    const url = new URL('/auth/callback', env.FRONTEND_URL);
    url.searchParams.set('returnTo', returnTo);
    res.redirect(303, url.toString());
  } catch (error) {
    googleFailure(res, error, returnTo);
  }
}

export function passwordAuthGone(_req: Request, res: Response) {
  res.status(410).json({ success: false, error: {
    code: 'GOOGLE_LOGIN_REQUIRED', message: 'กรุณาเข้าสู่ระบบหรือสมัครสมาชิกด้วย Google ของมหาวิทยาลัย',
  } });
}

export async function profile(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const user = await authService.updateProfile(req.auth.userId, req.body as ProfileInput);
  res.json({ success: true, data: { user } });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies[REFRESH_COOKIE] as string | undefined;
  if (!token) throw new AppError(401, 'MISSING_REFRESH_TOKEN', 'Refresh token cookie is missing');

  const meta = getClientMeta(req);
  const result = await authService.refresh(token, meta);
  setRefreshCookie(res, result.tokens.refreshToken);
  res.json({ success: true, data: { user: result.user, accessToken: result.tokens.accessToken } });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies[REFRESH_COOKIE] as string | undefined;
  await authService.logout(token);
  clearRefreshCookie(res);
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const user = await authService.currentUser(req.auth.userId);
  res.json({ success: true, data: { user } });
}
