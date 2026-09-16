import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { UserModel } from '../users/user.model.js';
import { FriendshipModel } from './friendship.model.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SearchUsersQuery {
  q?: string | undefined;
  university?: 'KMITL' | 'KMUTNB' | 'KMUTT' | undefined;
  limit?: number | undefined;
}

export async function searchUsers(currentUserId: string, query: SearchUsersQuery) {
  if (!currentUserId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const currentId = new Types.ObjectId(currentUserId);
  const limit = Math.min(query.limit ?? 20, 50);

  const filter: any = {
    _id: { $ne: currentId },
  };

  if (query.q) {
    filter.name = new RegExp(escapeRegex(query.q), 'i');
  }

  if (query.university) {
    filter.university = query.university;
  }

  const users = await UserModel.find(filter)
    .select('name email university')
    .limit(limit)
    .lean();

  if (users.length === 0) return [];

  const targetIds = users.map((u) => u._id);

  const friendships = await FriendshipModel.find({
    $or: [
      { requester: currentId, recipient: { $in: targetIds } },
      { recipient: currentId, requester: { $in: targetIds } },
    ],
  }).lean();

  return users.map((user) => {
    const rel = friendships.find(
      (f) =>
        (String(f.requester) === currentUserId && String(f.recipient) === String(user._id)) ||
        (String(f.recipient) === currentUserId && String(f.requester) === String(user._id)),
    );

    let status: 'none' | 'pending_sent' | 'pending_received' | 'friends' = 'none';
    let requestId: string | null = null;

    if (rel) {
      requestId = String(rel._id);
      if (rel.status === 'accepted') {
        status = 'friends';
      } else if (rel.status === 'pending') {
        status = String(rel.requester) === currentUserId ? 'pending_sent' : 'pending_received';
      }
    }

    return {
      id: String(user._id),
      name: user.name,
      university: user.university,
      relationshipStatus: status,
      requestId,
    };
  });
}

export async function sendFriendRequest(requesterId: string, recipientId: string) {
  if (requesterId === recipientId) {
    throw new AppError(400, 'BAD_REQUEST', 'Cannot add yourself as a friend');
  }

  const recipientExists = await UserModel.exists({ _id: recipientId });
  if (!recipientExists) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Target user not found');
  }

  const reqObjId = new Types.ObjectId(requesterId);
  const recObjId = new Types.ObjectId(recipientId);

  const existing = await FriendshipModel.findOne({
    $or: [
      { requester: reqObjId, recipient: recObjId },
      { requester: recObjId, recipient: reqObjId },
    ],
  });

  if (existing) {
    if (existing.status === 'accepted') {
      throw new AppError(409, 'ALREADY_FRIENDS', 'You are already friends');
    }
    if (existing.status === 'pending') {
      throw new AppError(409, 'REQUEST_PENDING', 'Friend request already exists');
    }
    existing.requester = reqObjId;
    existing.recipient = recObjId;
    existing.status = 'pending';
    await existing.save();
    return existing;
  }

  return FriendshipModel.create({
    requester: reqObjId,
    recipient: recObjId,
    status: 'pending',
  });
}

export async function respondFriendRequest(recipientId: string, requestId: string, action: 'accept' | 'reject') {
  const request = await FriendshipModel.findById(requestId);
  if (!request) {
    throw new AppError(404, 'REQUEST_NOT_FOUND', 'Friend request not found');
  }

  if (String(request.recipient) !== recipientId) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot respond to this request');
  }

  if (request.status !== 'pending') {
    throw new AppError(400, 'BAD_REQUEST', 'Request has already been handled');
  }

  request.status = action === 'accept' ? 'accepted' : 'rejected';
  await request.save();
  return request;
}