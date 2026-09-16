import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { sha256 } from '../../common/utils/hash.js';
import { SessionModel } from './session.model.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service.js';
import { UserModel } from '../users/user.model.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

const BCRYPT_ROUNDS = 12;

export interface ClientMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
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

export async function register(input: RegisterInput, meta?: ClientMeta) {
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
    university: input.university,
  });

  return { user, tokens: await issueSession(user.id, user.role, meta) };
}

export async function login(input: LoginInput, meta?: ClientMeta) {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
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
    // Logout is intentionally idempotent
  }
}