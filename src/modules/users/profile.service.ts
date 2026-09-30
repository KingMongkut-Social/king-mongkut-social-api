import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { FriendshipModel } from '../friends/friendship.model.js';
import { UserModel } from './user.model.js';
import { currentUser } from '../auth/auth.service.js';
import type { EditProfileInput, ProfileFriendsQuery } from './profile.schemas.js';

async function requireActiveUser(userId: string) {
  const user = await UserModel.findOne({ _id: userId, isActive: true })
    .select('name username bio university faculty department academicYear avatarUrl coverUrl').lean();
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  return user;
}

async function acceptedFriendIds(userId: string): Promise<string[]> {
  const friendships = await FriendshipModel.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  }).select('requester recipient').lean();
  return [...new Set(friendships.map((friendship) =>
    String(friendship.requester) === userId ? String(friendship.recipient) : String(friendship.requester)))];
}

export async function getProfile(userId: string, viewerId?: string) {
  const user = await requireActiveUser(userId);
  const canonicalUserId = String(user._id);
  const [friendIds, viewerFriendIds, relationships] = await Promise.all([
    acceptedFriendIds(canonicalUserId),
    viewerId && viewerId !== canonicalUserId ? acceptedFriendIds(viewerId) : Promise.resolve([]),
    viewerId && viewerId !== canonicalUserId
      ? FriendshipModel.find({
        $or: [
          { requester: viewerId, recipient: canonicalUserId },
          { requester: canonicalUserId, recipient: viewerId },
        ],
      }).select('_id requester status').lean()
      : Promise.resolve([]),
  ]);
  const activeFriends = friendIds.length
    ? await UserModel.find({ _id: { $in: friendIds }, isActive: true }).select('_id').lean()
    : [];
  const activeFriendIds = new Set(activeFriends.map((friend) => String(friend._id)));
  const viewerFriends = new Set(viewerFriendIds);
  const relationship = relationships.find((item) => item.status === 'accepted')
    ?? relationships.find((item) => item.status === 'pending');

  let relationshipStatus: 'self' | 'none' | 'friends' | 'pending_sent' | 'pending_received' = 'none';
  if (viewerId === canonicalUserId) relationshipStatus = 'self';
  else if (relationship?.status === 'accepted') relationshipStatus = 'friends';
  else if (relationship?.status === 'pending') {
    relationshipStatus = String(relationship.requester) === viewerId ? 'pending_sent' : 'pending_received';
  }

  return {
    id: String(user._id),
    name: user.name,
    username: user.username ?? null,
    bio: user.bio ?? '',
    university: user.university,
    faculty: user.faculty,
    department: user.department,
    academicYear: user.academicYear ?? null,
    avatarUrl: user.avatarUrl ?? null,
    coverUrl: user.coverUrl ?? null,
    friendCount: activeFriendIds.size,
    mutualFriendCount: viewerId && viewerId !== canonicalUserId
      ? [...activeFriendIds].filter((id) => viewerFriends.has(id)).length : 0,
    relationshipStatus,
    requestId: relationship ? String(relationship._id) : null,
  };
}

export async function listProfileFriends(userId: string, query: ProfileFriendsQuery) {
  const user = await requireActiveUser(userId);
  const friendIds = await acceptedFriendIds(String(user._id));
  if (!friendIds.length) {
    return { items: [], page: query.page, limit: query.limit, total: 0, pages: 0 };
  }
  const filter = { _id: { $in: friendIds.map((id) => new Types.ObjectId(id)) }, isActive: true };
  const [users, total] = await Promise.all([
    UserModel.find(filter).select('name username university faculty department avatarUrl')
      .sort({ name: 1, _id: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    UserModel.countDocuments(filter),
  ]);
  return {
    items: users.map((user) => ({
      id: String(user._id), name: user.name, university: user.university,
      username: user.username ?? null, avatarUrl: user.avatarUrl ?? null,
      faculty: user.faculty, department: user.department,
    })),
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.ceil(total / query.limit),
  };
}

export async function assertProfileExists(userId: string): Promise<void> {
  await requireActiveUser(userId);
}

function usernameConflict(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 11000
    && 'keyPattern' in error && typeof error.keyPattern === 'object'
    && error.keyPattern !== null && 'username' in error.keyPattern;
}

export async function editProfile(userId: string, input: EditProfileInput) {
  await currentUser(userId);
  try {
    const user = await UserModel.findOneAndUpdate(
      { _id: userId, isActive: true }, { $set: input }, { returnDocument: 'after', runValidators: true },
    );
    if (!user) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
    return user;
  } catch (error) {
    if (usernameConflict(error)) throw new AppError(409, 'USERNAME_TAKEN', 'Username is already in use');
    throw error;
  }
}

export async function setProfileImage(userId: string, kind: 'avatar' | 'cover', url: string | null) {
  await currentUser(userId);
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, isActive: true }, { $set: { [kind === 'avatar' ? 'avatarUrl' : 'coverUrl']: url } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!user) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
  return user;
}
