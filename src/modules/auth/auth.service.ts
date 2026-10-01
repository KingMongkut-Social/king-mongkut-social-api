import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { sha256 } from '../../common/utils/hash.js';
import { SessionModel } from './session.model.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service.js';
import { UserModel } from '../users/user.model.js';
import type { GoogleIdentity } from './google.service.js';
import type { ProfileInput } from './auth.schemas.js';
import { universityForEmail } from './university-email.js';

export interface ClientMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

async function issueSession(userId: string, role: 'user' | 'admin', meta?: ClientMeta) {
  const refresh = await signRefreshToken(userId);
  await SessionModel.create({
    user: new Types.ObjectId(userId), tokenHash: sha256(refresh.jti), expiresAt: refresh.expiresAt,
    ip: meta?.ip ?? null, userAgent: meta?.userAgent ?? null,
  });
  return { accessToken: await signAccessToken(userId, role), refreshToken: refresh.token };
}

function conflict(): never {
  throw new AppError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'This email is linked to another Google account');
}

async function findOrLinkGoogleUser(identity: GoogleIdentity) {
  const bySubject = await UserModel.findOne({ googleSub: identity.sub }).select('+googleSub');
  if (bySubject) {
    if (!bySubject.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
    if (await UserModel.exists({ email: identity.email, _id: { $ne: bySubject._id } })) conflict();
    bySubject.email = identity.email;
    bySubject.university = identity.university;
    bySubject.emailVerified = true;
    return bySubject.save();
  }

  const byEmail = await UserModel.findOne({ email: identity.email }).select('+googleSub');
  if (byEmail) {
    if (!byEmail.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
    if (byEmail.googleSub && byEmail.googleSub !== identity.sub) conflict();
    // Conditional update prevents two different Google identities claiming a legacy account.
    const linked = await UserModel.findOneAndUpdate({
      _id: byEmail._id, isActive: true,
      $or: [{ googleSub: { $exists: false } }, { googleSub: null }, { googleSub: identity.sub }],
    }, { $set: {
      googleSub: identity.sub,
      emailVerified: true,
      university: identity.university,
      ...(byEmail.googleSub ? {} : { profileSetupRequired: true }),
    } },
    { returnDocument: 'after', runValidators: true }).select('+googleSub');
    if (!linked) conflict();
    return linked;
  }

  return UserModel.create({
    googleSub: identity.sub,
    email: identity.email,
    name: identity.name,
    university: identity.university,
    emailVerified: true,
    profileSetupRequired: true,
  });
}

export async function googleLogin(identity: GoogleIdentity, meta?: ClientMeta) {
  let user;
  try {
    user = await findOrLinkGoogleUser(identity);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 11000) throw error;
    // A concurrent first login may have created the same identity. Never relink a conflicting one.
    user = await UserModel.findOne({ googleSub: identity.sub, email: identity.email });
    if (!user) conflict();
  }
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
  return { user, tokens: await issueSession(user.id, user.role, meta) };
}

export async function currentUser(userId: string) {
  const user = await UserModel.findById(userId).select('+googleSub');
  if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User no longer exists');
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
  if (!user.googleSub || !user.emailVerified || !universityForEmail(user.email)) {
    throw new AppError(401, 'GOOGLE_LOGIN_REQUIRED', 'Sign in with your university Google account');
  }
  return user;
}

export async function updateProfile(userId: string, input: ProfileInput) {
  const user = await currentUser(userId);

  if (user.profileSetupRequired === true) {
    const name = input.name?.trim() ?? user.name.trim();
    const username = input.username?.trim().toLowerCase() ?? user.username?.trim().toLowerCase() ?? '';
    const bio = input.bio?.trim() ?? user.bio.trim();
    const faculty = input.faculty?.trim() ?? user.faculty?.trim() ?? '';
    const department = input.department?.trim() ?? user.department?.trim() ?? '';
    const academicYear = input.academicYear ?? user.academicYear ?? null;

    const missing = [
      !name ? 'ชื่อที่แสดง' : '',
      !username ? 'Username' : '',
      !bio ? 'Bio' : '',
      !faculty ? 'คณะ' : '',
      !department ? 'ภาควิชา' : '',
      academicYear == null ? 'ชั้นปี' : '',
      !user.avatarUrl ? 'รูปโปรไฟล์' : '',
      !user.coverUrl ? 'รูปหน้าปก' : '',
    ].filter(Boolean);

    if (missing.length) {
      throw new AppError(
        422,
        'PROFILE_SETUP_REQUIRED',
        `กรุณากรอกข้อมูลให้ครบ: ${missing.join(', ')}`,
      );
    }

    user.name = name;
    user.username = username;
    user.bio = bio;
    user.faculty = faculty;
    user.department = department;
    user.academicYear = academicYear;
    user.profileSetupRequired = false;

    try {
      await user.save();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new AppError(409, 'USERNAME_TAKEN', 'Username นี้ถูกใช้งานแล้ว');
      }
      throw error;
    }
    return user;
  }

  if (!input.faculty?.trim() || !input.department?.trim()) {
    throw new AppError(422, 'PROFILE_INCOMPLETE', 'กรุณากรอกคณะและภาควิชา');
  }

  user.faculty = input.faculty.trim();
  user.department = input.department.trim();
  await user.save();
  return user;
}

export async function refresh(refreshToken: string, meta?: ClientMeta) {
  const payload = await verifyRefreshToken(refreshToken);
  const session = await SessionModel.findOneAndUpdate({
    user: new Types.ObjectId(payload.sub), tokenHash: sha256(payload.jti),
    revokedAt: null, expiresAt: { $gt: new Date() },
  }, { $set: { revokedAt: new Date() } }, { returnDocument: 'before' });
  if (!session) throw new AppError(401, 'SESSION_REVOKED', 'Refresh session is no longer valid');
  const user = await currentUser(payload.sub);
  return { user, tokens: await issueSession(user.id, user.role, meta) };
}

export async function logout(refreshToken?: string) {
  if (!refreshToken) return;
  try {
    const payload = await verifyRefreshToken(refreshToken);
    await SessionModel.updateOne({
      user: new Types.ObjectId(payload.sub), tokenHash: sha256(payload.jti), revokedAt: null,
    }, { $set: { revokedAt: new Date() } });
  } catch {
    // Logout is intentionally idempotent.
  }
}
