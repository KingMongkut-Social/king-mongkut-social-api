import bcrypt from 'bcryptjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { sha256 } from '../../common/utils/hash.js';
import { env } from '../../config/env.js';
import { UserModel } from '../users/user.model.js';
import type { GoogleLoginInput, LoginInput, RegisterInput } from './auth.schemas.js';
import { universityForEmail } from './institution.js';
import { SessionModel } from './session.model.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service.js';

const BCRYPT_ROUNDS = 12;
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface ClientMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

interface GoogleTokenResponse {
  id_token?: string;
}

async function issueSession(userId: string, role: 'user' | 'admin', meta?: ClientMeta) {
  const refresh = await signRefreshToken(userId);
  await SessionModel.create({
    user: new Types.ObjectId(userId),
    tokenHash: sha256(refresh.jti),
    expiresAt: refresh.expiresAt,
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  });

  return {
    accessToken: await signAccessToken(userId, role),
    refreshToken: refresh.token,
  };
}

function assertInstitution(email: string, expected?: GoogleLoginInput['university']): GoogleLoginInput['university'] {
  const university = universityForEmail(email);
  if (!university) {
    throw new AppError(
      403,
      'UNIVERSITY_EMAIL_REQUIRED',
      'Only @kmitl.ac.th, @mail.kmutt.ac.th, and @email.kmutnb.ac.th accounts are allowed',
    );
  }
  if (expected && university !== expected) {
    throw new AppError(403, 'UNIVERSITY_MISMATCH', 'The selected institution does not match your Google account');
  }
  return university;
}

async function exchangeGoogleCode(code: string, redirectUri: string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(503, 'GOOGLE_AUTH_NOT_CONFIGURED', 'Google login is not configured on the server');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = await response.json() as GoogleTokenResponse;
  if (!response.ok || !data.id_token) {
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified');
  }

  try {
    const { payload } = await jwtVerify(data.id_token, googleJwks, {
      audience: env.GOOGLE_CLIENT_ID,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      algorithms: ['RS256'],
    });

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    const emailVerified = payload.email_verified === true;
    const subject = typeof payload.sub === 'string' ? payload.sub : null;
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const picture = typeof payload.picture === 'string' ? payload.picture : null;

    if (!email || !emailVerified || !subject) {
      throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google account email is not verified');
    }

    return { email, subject, name, picture };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified');
  }
}

export async function register(input: RegisterInput, meta?: ClientMeta) {
  const university = assertInstitution(input.email);
  if (university !== input.university) {
    throw new AppError(422, 'UNIVERSITY_MISMATCH', 'University does not match the email domain');
  }
  if (bcrypt.truncates(input.password)) {
    throw new AppError(422, 'PASSWORD_TOO_LONG', 'Password must not exceed 72 UTF-8 bytes');
  }

  const exists = await UserModel.exists({ email: input.email });
  if (exists) throw new AppError(409, 'EMAIL_IN_USE', 'Email is already registered');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash,
    university,
  });

  return { user, tokens: await issueSession(user.id, user.role, meta) };
}

export async function login(input: LoginInput, meta?: ClientMeta) {
  assertInstitution(input.email);

  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  if (!user || !user.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
  }

  return { user, tokens: await issueSession(user.id, user.role, meta) };
}

export async function googleLogin(input: GoogleLoginInput, redirectUri: string, meta?: ClientMeta) {
  if (!env.CORS_ORIGINS.includes(redirectUri)) {
    throw new AppError(403, 'GOOGLE_AUTH_ORIGIN_FORBIDDEN', 'Google login origin is not allowed');
  }
  const profile = await exchangeGoogleCode(input.code, redirectUri);
  const university = assertInstitution(profile.email, input.university);

  const [byGoogle, byEmail] = await Promise.all([
    UserModel.findOne({ googleSub: profile.subject }),
    UserModel.findOne({ email: profile.email }),
  ]);

  if (byGoogle && byEmail && byGoogle.id !== byEmail.id) {
    throw new AppError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'This Google account is already linked to another user');
  }

  let user = byGoogle ?? byEmail;
  if (!user) {
    const fallbackName = profile.email.split('@')[0] ?? 'Student';
    const displayName = (profile.name || fallbackName).slice(0, 80);
    user = await UserModel.create({
      name: displayName.length >= 2 ? displayName : 'Student',
      email: profile.email,
      googleSub: profile.subject,
      avatarUrl: profile.picture,
      university,
      emailVerified: true,
    });
  } else {
    if (!user.isActive) {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
    }
    if (user.googleSub && user.googleSub !== profile.subject) {
      throw new AppError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'This email is linked to a different Google account');
    }

    user.googleSub = profile.subject;
    user.email = profile.email;
    user.university = university;
    user.emailVerified = true;
    if (profile.name.length >= 2) user.name = profile.name.slice(0, 80);
    user.avatarUrl = profile.picture;
    await user.save();
  }

  return { user, tokens: await issueSession(user.id, user.role, meta) };
}

export async function refresh(refreshToken: string, meta?: ClientMeta) {
  const payload = await verifyRefreshToken(refreshToken);
  const session = await SessionModel.findOneAndUpdate(
    {
      user: new Types.ObjectId(payload.sub),
      tokenHash: sha256(payload.jti),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date() } },
    { new: false },
  );

  if (!session) throw new AppError(401, 'SESSION_REVOKED', 'Refresh session is no longer valid');

  const user = await UserModel.findById(payload.sub);
  if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User no longer exists');
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');

  return { user, tokens: await issueSession(user.id, user.role, meta) };
}

export async function logout(refreshToken?: string) {
  if (!refreshToken) return;

  try {
    const payload = await verifyRefreshToken(refreshToken);
    await SessionModel.updateOne(
      { user: new Types.ObjectId(payload.sub), tokenHash: sha256(payload.jti), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  } catch {
    // Logout is intentionally idempotent.
  }
}
