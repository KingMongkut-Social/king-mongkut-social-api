import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { AppError } from '../../common/errors/app-error.js';
import { durationToMs } from '../../common/utils/duration.js';
import { env } from '../../config/env.js';
import type { Role } from '../users/user.model.js';

const accessSecret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
const refreshSecret = new TextEncoder().encode(env.REFRESH_TOKEN_SECRET);
const ISSUER = 'king-mongkut-social-api';
const AUDIENCE = 'king-mongkut-social-app';

interface AccessClaims {
  sub: string;
  role: Role;
  exp: number;
}

interface RefreshClaims {
  sub: string;
  jti: string;
}

export async function signAccessToken(userId: string, role: Role): Promise<string> {
  return new SignJWT({ role, tokenType: 'access', authVersion: 2 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

export async function signRefreshToken(userId: string): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = randomUUID();
  const token = await new SignJWT({ tokenType: 'refresh', authVersion: 2 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(env.REFRESH_TOKEN_TTL)
    .sign(refreshSecret);

  return {
    token,
    jti,
    expiresAt: new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_TTL)),
  };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub) || payload.authVersion !== 2
      || payload.tokenType !== 'access'
      || (payload.role !== 'user' && payload.role !== 'admin')
      || typeof payload.exp !== 'number'
    ) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token');
    }
    return { sub: payload.sub, role: payload.role, exp: payload.exp };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof joseErrors.JOSEError) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired access token');
    }
    throw error;
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshClaims> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub) || payload.authVersion !== 2 || typeof payload.jti !== 'string' || payload.tokenType !== 'refresh') {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }
    return { sub: payload.sub, jti: payload.jti };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof joseErrors.JOSEError) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }
    throw error;
  }
}
