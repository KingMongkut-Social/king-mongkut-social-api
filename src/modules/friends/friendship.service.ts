import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { UserModel, type University } from '../users/user.model.js';
import { isUserOnline } from '../chats/chat.realtime.js';
import { FriendshipModel } from './friendship.model.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pairKey(firstId: string, secondId: string): string {
  return [firstId.toLowerCase(), secondId.toLowerCase()].sort().join(':');
}

type PublicUser = {
  _id: Types.ObjectId;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  university: University;
  faculty?: string;
  department?: string;
};

function serializeUser(user: PublicUser) {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username ?? null,
    avatarUrl: user.avatarUrl ?? null,
    university: user.university,
    faculty: user.faculty,
    department: user.department,
  };
}

function relationshipFor(currentUserId: string, friendship: {
  _id: Types.ObjectId;
  requester: Types.ObjectId;
  status: string;
} | undefined) {
  if (!friendship || friendship.status === 'rejected') {
    return { relationshipStatus: 'none' as const, requestId: null };
  }
  if (friendship.status === 'accepted') {
    return { relationshipStatus: 'friends' as const, requestId: String(friendship._id) };
  }
  return {
    relationshipStatus: String(friendship.requester) === currentUserId ? 'pending_sent' as const : 'pending_received' as const,
    requestId: String(friendship._id),
  };
}

export interface SearchUsersQuery {
  q?: string | undefined;
  university?: University | undefined;
  limit?: number | undefined;
}

async function activeFriendIds(userId: string): Promise<string[]> {
  const friendships = await FriendshipModel.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  }).select('requester recipient').lean();
  const ids = [...new Set(friendships.map((friendship) =>
    String(friendship.requester) === userId ? String(friendship.recipient) : String(friendship.requester)))];
  if (!ids.length) return [];
  const users = await UserModel.find({ _id: { $in: ids }, isActive: true }).select('_id').lean();
  return users.map((user) => String(user._id));
}

async function mutualFriendCounts(currentUserId: string, targetUserIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!targetUserIds.length) return counts;
  const friendIds = await activeFriendIds(currentUserId);
  if (!friendIds.length) return counts;
  const friendships = await FriendshipModel.find({
    status: 'accepted',
    $or: [
      { requester: { $in: targetUserIds }, recipient: { $in: friendIds } },
      { recipient: { $in: targetUserIds }, requester: { $in: friendIds } },
    ],
  }).select('requester recipient').lean();
  const targetSet = new Set(targetUserIds);
  const friendSet = new Set(friendIds);
  const mutualByTarget = new Map<string, Set<string>>();
  for (const friendship of friendships) {
    const requester = String(friendship.requester);
    const recipient = String(friendship.recipient);
    if (targetSet.has(requester) && friendSet.has(recipient)) {
      const shared = mutualByTarget.get(requester) ?? new Set<string>();
      shared.add(recipient);
      mutualByTarget.set(requester, shared);
    }
    if (targetSet.has(recipient) && friendSet.has(requester)) {
      const shared = mutualByTarget.get(recipient) ?? new Set<string>();
      shared.add(requester);
      mutualByTarget.set(recipient, shared);
    }
  }
  for (const [userId, shared] of mutualByTarget) counts.set(userId, shared.size);
  return counts;
}

export async function searchUsers(currentUserId: string, query: SearchUsersQuery) {
  const currentId = new Types.ObjectId(currentUserId);
  const limit = Math.min(query.limit ?? 20, 50);
  const filter: Record<string, unknown> = { _id: { $ne: currentId }, isActive: true };
  if (query.q) filter.name = new RegExp(escapeRegex(query.q), 'i');
  if (query.university) filter.university = query.university;

  const users = await UserModel.find(filter).select('name username avatarUrl university faculty department').limit(limit).lean();
  if (users.length === 0) return [];

  const targetIds = users.map((user) => user._id);
  const friendships = await FriendshipModel.find({
    $or: [
      { requester: currentId, recipient: { $in: targetIds } },
      { recipient: currentId, requester: { $in: targetIds } },
    ],
  }).lean();

  const mutualCounts = await mutualFriendCounts(currentUserId, users.map((user) => String(user._id)));

  return users.map((user) => {
    const related = friendships.filter((friendship) =>
      (String(friendship.requester) === currentUserId && String(friendship.recipient) === String(user._id))
      || (String(friendship.recipient) === currentUserId && String(friendship.requester) === String(user._id)));
    const friendship = related.find((item) => item.status === 'accepted')
      ?? related.find((item) => item.status === 'pending');
    return {
      ...serializeUser(user),
      ...relationshipFor(currentUserId, friendship),
      mutualFriendCount: mutualCounts.get(String(user._id)) ?? 0,
    };
  });
}

export async function getUserConnection(currentUserId: string, targetUserId: string) {
  if (currentUserId === targetUserId) throw new AppError(400, 'BAD_REQUEST', 'Cannot view yourself as a connection');
  const user = await UserModel.findOne({ _id: targetUserId, isActive: true })
    .select('name username avatarUrl university faculty department').lean();
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Target user not found');
  const related = await FriendshipModel.find({
    $or: [
      { requester: currentUserId, recipient: targetUserId },
      { requester: targetUserId, recipient: currentUserId },
    ],
  }).lean();
  const friendship = related.find((item) => item.status === 'accepted')
    ?? related.find((item) => item.status === 'pending');
  const mutualCounts = await mutualFriendCounts(currentUserId, [targetUserId]);
  return {
    ...serializeUser(user),
    ...relationshipFor(currentUserId, friendship),
    mutualFriendCount: mutualCounts.get(targetUserId) ?? 0,
  };
}

export async function listFriends(currentUserId: string) {
  const friendships = await FriendshipModel.find({
    status: 'accepted',
    $or: [{ requester: currentUserId }, { recipient: currentUserId }],
  }).sort({ updatedAt: -1 }).lean();
  const friendIds = friendships.map((friendship) =>
    String(friendship.requester) === currentUserId ? friendship.recipient : friendship.requester);
  const users = await UserModel.find({ _id: { $in: friendIds }, isActive: true })
    .select('name username avatarUrl university faculty department').lean();
  const mutualCounts = await mutualFriendCounts(currentUserId, users.map((user) => String(user._id)));
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const seen = new Set<string>();
  return friendships.flatMap((friendship) => {
    const friendId = String(friendship.requester) === currentUserId
      ? String(friendship.recipient) : String(friendship.requester);
    const user = userById.get(friendId);
    if (!user || seen.has(friendId)) return [];
    seen.add(friendId);
    return [{
      ...serializeUser(user),
      friendshipId: String(friendship._id),
      isOnline: isUserOnline(friendId),
      mutualFriendCount: mutualCounts.get(friendId) ?? 0,
    }];
  });
}

export async function suggestFriends(currentUserId: string, limit: number) {
  const relationships = await FriendshipModel.find({
    status: { $in: ['accepted', 'pending'] },
    $or: [{ requester: currentUserId }, { recipient: currentUserId }],
  }).select('requester recipient').lean();
  const excludedIds = new Set([currentUserId, ...relationships.map((friendship) =>
    String(friendship.requester) === currentUserId ? String(friendship.recipient) : String(friendship.requester))]);
  const friendIds = await activeFriendIds(currentUserId);
  const scored: { _id: Types.ObjectId; mutualFriendCount: number; user: PublicUser }[] = friendIds.length
    ? await FriendshipModel.aggregate([
      { $match: { status: 'accepted', $or: [
        { requester: { $in: friendIds.map((id) => new Types.ObjectId(id)) } },
        { recipient: { $in: friendIds.map((id) => new Types.ObjectId(id)) } },
      ] } },
      { $project: {
        candidateId: { $cond: [
          { $in: ['$requester', friendIds.map((id) => new Types.ObjectId(id))] },
          '$recipient', '$requester',
        ] },
        mutualId: { $cond: [
          { $in: ['$requester', friendIds.map((id) => new Types.ObjectId(id))] },
          '$requester', '$recipient',
        ] },
      } },
      { $match: { candidateId: { $nin: [...excludedIds].map((id) => new Types.ObjectId(id)) } } },
      { $group: { _id: { candidateId: '$candidateId', mutualId: '$mutualId' } } },
      { $group: { _id: '$_id.candidateId', mutualFriendCount: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.isActive': true } },
      { $sort: { mutualFriendCount: -1, 'user.name': 1, _id: 1 } },
      { $limit: limit },
    ])
    : [];
  const suggestions = scored.map((entry) => ({
    ...serializeUser(entry.user),
    relationshipStatus: 'none' as const,
    requestId: null,
    mutualFriendCount: entry.mutualFriendCount,
  }));
  if (suggestions.length === limit) return suggestions;
  const filler = await UserModel.find({
    _id: { $nin: [...excludedIds, ...suggestions.map((user) => user.id)] },
    isActive: true,
  }).select('name username avatarUrl university faculty department').sort({ name: 1, _id: 1 }).limit(limit - suggestions.length).lean();
  return [...suggestions, ...filler.map((user) => ({
    ...serializeUser(user), relationshipStatus: 'none' as const, requestId: null, mutualFriendCount: 0,
  }))];
}

export async function listFriendRequests(currentUserId: string) {
  const friendships = await FriendshipModel.find({
    status: 'pending',
    $or: [{ requester: currentUserId }, { recipient: currentUserId }],
  }).sort({ createdAt: -1 }).lean();
  const userIds = [...new Set(friendships.flatMap((friendship) =>
    [String(friendship.requester), String(friendship.recipient)]))];
  const users = await UserModel.find({ _id: { $in: userIds }, isActive: true })
    .select('name username avatarUrl university faculty department').lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const seen = new Set<string>();
  const requests = friendships.flatMap((friendship) => {
    const requester = userById.get(String(friendship.requester));
    const recipient = userById.get(String(friendship.recipient));
    const key = pairKey(String(friendship.requester), String(friendship.recipient));
    if (!requester || !recipient || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: String(friendship._id),
      requester: serializeUser(requester),
      recipient: serializeUser(recipient),
      createdAt: friendship.createdAt,
    }];
  });
  return {
    incoming: requests.filter((request) => request.recipient.id === currentUserId),
    outgoing: requests.filter((request) => request.requester.id === currentUserId),
  };
}

function throwExistingFriendship(status: string): never {
  if (status === 'accepted') throw new AppError(409, 'ALREADY_FRIENDS', 'You are already friends');
  throw new AppError(409, 'REQUEST_PENDING', 'Friend request already exists');
}

export async function sendFriendRequest(requesterId: string, recipientId: string) {
  if (requesterId === recipientId) throw new AppError(400, 'BAD_REQUEST', 'Cannot add yourself as a friend');
  if (!await UserModel.exists({ _id: recipientId, isActive: true })) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Target user not found');
  }

  const related = await FriendshipModel.find({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId },
    ],
  });
  const existing = related.find((item) => item.status === 'accepted')
    ?? related.find((item) => item.status === 'pending')
    ?? related[0];
  if (existing?.status === 'accepted' || existing?.status === 'pending') {
    throwExistingFriendship(existing.status);
  }

  const key = pairKey(requesterId, recipientId);
  try {
    if (existing) {
      const restarted = await FriendshipModel.findOneAndUpdate(
        { _id: existing._id, status: 'rejected' },
        { $set: { requester: requesterId, recipient: recipientId, pairKey: key, status: 'pending' } },
        { returnDocument: 'after', runValidators: true },
      );
      if (restarted) return restarted;
      throw new AppError(409, 'REQUEST_PENDING', 'Friend request already exists');
    }
    return await FriendshipModel.create({ requester: requesterId, recipient: recipientId, pairKey: key, status: 'pending' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      const winner = await FriendshipModel.findOne({ pairKey: key });
      throwExistingFriendship(winner?.status ?? 'pending');
    }
    throw error;
  }
}

export async function respondFriendRequest(recipientId: string, requestId: string, action: 'accept' | 'reject') {
  const request = await FriendshipModel.findOneAndUpdate(
    { _id: requestId, recipient: recipientId, status: 'pending' },
    { $set: { status: action === 'accept' ? 'accepted' : 'rejected' } },
    { returnDocument: 'after', runValidators: true },
  );
  if (request) return request;
  const existing = await FriendshipModel.findById(requestId);
  if (!existing) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
  if (String(existing.recipient) !== recipientId) throw new AppError(403, 'FORBIDDEN', 'Cannot respond to this request');
  throw new AppError(409, 'REQUEST_HANDLED', 'Request has already been handled');
}

export async function cancelFriendRequest(requesterId: string, requestId: string) {
  const request = await FriendshipModel.findOneAndUpdate(
    { _id: requestId, requester: requesterId, status: 'pending' },
    { $set: { status: 'rejected' } },
    { returnDocument: 'after', runValidators: true },
  );
  if (request) return request;
  const existing = await FriendshipModel.findById(requestId);
  if (!existing) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
  if (String(existing.requester) !== requesterId) throw new AppError(403, 'FORBIDDEN', 'Cannot cancel this request');
  throw new AppError(409, 'REQUEST_HANDLED', 'Request has already been handled');
}
