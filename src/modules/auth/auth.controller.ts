import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { durationToMs } from '../../common/utils/duration.js';
import { env } from '../../config/env.js';
import { UserModel } from '../users/user.model.js';
import * as authService from './auth.service.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

const REFRESH_COOKIE = 'refresh_token';

function getClientMeta(req: Request) {
  const userAgent = (req.headers['user-agent'] as string) || undefined;
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) || req.ip || undefined;
  return { ip, userAgent };
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

export async function register(req: Request, res: Response) {
  const meta = getClientMeta(req);
  const result = await authService.register(req.body as RegisterInput, meta);
  setRefreshCookie(res, result.tokens.refreshToken);
  res.status(201).json({ success: true, data: { user: result.user, accessToken: result.tokens.accessToken } });
}

export async function login(req: Request, res: Response) {
  const meta = getClientMeta(req);
  const result = await authService.login(req.body as LoginInput, meta);
  setRefreshCookie(res, result.tokens.refreshToken);
  res.json({ success: true, data: { user: result.user, accessToken: result.tokens.accessToken } });
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
  const user = await UserModel.findById(req.auth.userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  res.json({ success: true, data: { user } });
}