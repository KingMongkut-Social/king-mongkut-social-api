import { Types, type FilterQuery } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { UserModel, type User } from '../users/user.model.js';
import { FriendshipModel } from './friendship.model.js';
import type { SearchUsersQueryInput } from './friendship.schemas.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchUsers(currentUserId: string, query: SearchUsersQueryInput) {
  const currentId = new Types.ObjectId(currentUserId);
  const filter: FilterQuery<User> = {
    _id: { $ne: currentId },
  };

  if (query.q) {
    filter.name = new RegExp(escapeRegex(query.q), 'i');
  }
  if (query.university) {
    filter.university = query.university;
  }

  const users = await UserModel.find(filter)
    .select('name email university avatarUrl')
    .limit(query.limit)
    .lean();

  if (users.length === 0) return [];

  const targetIds = users.map((user) => user._id);
  const friendships = await FriendshipModel.find({
    $or: [
      { requester: currentId, recipient: { $in: targetIds } },
      { recipient: currentId, requester: { $in: targetIds } },
    ],
  }).lean();

  return users.map((user) => {
    const relationship = friendships.find(
      (friendship) =>
        (String(friendship.requester) === currentUserId && String(friendship.recipient) === String(user._id)) ||
        (String(friendship.recipient) === currentUserId && String(friendship.requester) === String(user._id)),
    );

    let status: 'none' | 'pending_sent' | 'pending_received' | 'friends' = 'none';
    let requestId: string | null = null;

    if (relationship) {
      requestId = String(relationship._id);
      if (relationship.status === 'accepted') {
        status = 'friends';
      } else if (relationship.status === 'pending') {
        status = String(relationship.requester) === currentUserId ? 'pending_sent' : 'pending_received';
      }
    }

    return {
      id: String(user._id),
      name: user.name,
      university: user.university,
      avatarUrl: user.avatarUrl,
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

  const requester = new Types.ObjectId(requesterId);
  const recipient = new Types.ObjectId(recipientId);

  const existing = await FriendshipModel.findOne({
    $or: [
      { requester, recipient },
      { requester: recipient, recipient: requester },
    ],
  });

  if (existing) {
    if (existing.status === 'accepted') {
      throw new AppError(409, 'ALREADY_FRIENDS', 'You are already friends');
    }
    if (existing.status === 'pending') {
      throw new AppError(409, 'REQUEST_PENDING', 'Friend request already exists');
    }
    existing.requester = requester;
    existing.recipient = recipient;
    existing.status = 'pending';
    await existing.save();
    return existing;
  }

  return FriendshipModel.create({
    requester,
    recipient,
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
