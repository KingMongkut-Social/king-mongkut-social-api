import type { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { createNotification } from '../notifications/notification.service.js';
import { NotificationModel } from '../notifications/notification.model.js';
import { UserModel, type Role } from '../users/user.model.js';
import { CommunityGroupModel } from './group.model.js';
import { GroupMemberModel, type GroupRole } from './group-member.model.js';
import { GroupPostModel } from './group-post.model.js';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

type GroupView = {
  _id: Types.ObjectId;
  name: string;
  description: string;
  coverUrl?: string | null;
  privacy: 'public' | 'private';
  university?: 'KMITL' | 'KMUTT' | 'KMUTNB' | null;
  creator: unknown;
  createdAt: Date;
};

async function serializeGroup(group: GroupView, viewerId?: string) {
  const groupId = group._id.toHexString();
  const [memberCount, membership] = await Promise.all([
    GroupMemberModel.countDocuments({ group: group._id }),
    viewerId
      ? GroupMemberModel.findOne({ group: group._id, user: viewerId }).select('role').lean()
      : null,
  ]);
  return {
    id: groupId,
    name: group.name,
    description: group.description,
    coverUrl: group.coverUrl ?? null,
    privacy: group.privacy,
    university: group.university ?? null,
    creator: group.creator,
    memberCount,
    membershipRole: membership?.role ?? null,
    joined: Boolean(membership),
    createdAt: group.createdAt,
  };
}

async function requireReadableGroup(id: string, viewerId?: string) {
  const group = await CommunityGroupModel.findById(id).lean();
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  if (group.privacy === 'private') {
    const membership = viewerId ? await GroupMemberModel.exists({ group: id, user: viewerId }) : null;
    if (!membership) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  }
  return group;
}

async function requireGroupRole(groupId: string, userId: string, allowed: GroupRole[]) {
  const [group, membership] = await Promise.all([
    CommunityGroupModel.findById(groupId).lean(),
    GroupMemberModel.findOne({ group: groupId, user: userId }),
  ]);
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  if (!membership || !allowed.includes(membership.role)) {
    throw new AppError(403, 'GROUP_PERMISSION_DENIED', 'You do not have permission to manage this group');
  }
  return { group, membership };
}

export async function listGroups(
  query: { q?: string; university?: string; page: number; limit: number },
  viewerId?: string,
) {
  const clauses: Record<string, unknown>[] = [];
  if (viewerId) {
    const memberships = await GroupMemberModel.find({ user: viewerId }).select('group').lean();
    clauses.push({
      $or: [
        { privacy: 'public' },
        { _id: { $in: memberships.map((membership) => membership.group) } },
      ],
    });
  } else {
    clauses.push({ privacy: 'public' });
  }

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    clauses.push({ $or: [{ name: pattern }, { description: pattern }] });
  }
  if (query.university) clauses.push({ university: query.university });

  const filter: Record<string, unknown> = clauses.length === 1 ? clauses[0]! : { $and: clauses };
  const [groups, total] = await Promise.all([
    CommunityGroupModel.find(filter).sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('creator', 'name username avatarUrl university').lean(),
    CommunityGroupModel.countDocuments(filter),
  ]);
  return {
    items: await Promise.all(groups.map((group) => serializeGroup(group as unknown as GroupView, viewerId))),
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.ceil(total / query.limit),
  };
}

export async function listUserGroups(targetUserId: string, viewerId?: string) {
  if (!await UserModel.exists({ _id: targetUserId, isActive: true })) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  const memberships = await GroupMemberModel.find({ user: targetUserId }).select('group').lean();
  const filter: Record<string, unknown> = {
    _id: { $in: memberships.map((membership) => membership.group) },
    ...(viewerId === targetUserId ? {} : { privacy: 'public' }),
  };
  const groups = await CommunityGroupModel.find(filter).sort({ createdAt: -1 })
    .populate('creator', 'name username avatarUrl university').lean();
  return Promise.all(groups.map((group) => serializeGroup(group as unknown as GroupView, viewerId)));
}

export async function createGroup(
  userId: string,
  input: {
    name: string;
    description: string;
    privacy: 'public' | 'private';
    university?: 'KMITL' | 'KMUTT' | 'KMUTNB' | null;
  },
) {
  const group = await CommunityGroupModel.create({
    name: input.name,
    description: input.description,
    privacy: input.privacy,
    creator: userId,
    ...(input.university ? { university: input.university } : {}),
  });
  await GroupMemberModel.create({ group: group._id, user: userId, role: 'owner' });
  const populated = await CommunityGroupModel.findById(group._id)
    .populate('creator', 'name username avatarUrl university').lean();
  if (!populated) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  return serializeGroup(populated, userId);
}

export async function getGroup(id: string, viewerId?: string) {
  const group = await CommunityGroupModel.findById(id)
    .populate('creator', 'name username avatarUrl university').lean();
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  if (group.privacy === 'private') {
    const membership = viewerId ? await GroupMemberModel.exists({ group: id, user: viewerId }) : null;
    if (!membership) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  }
  return serializeGroup(group, viewerId);
}

export async function joinGroup(id: string, userId: string) {
  const group = await CommunityGroupModel.findById(id).lean();
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  if (group.privacy === 'private') {
    throw new AppError(403, 'GROUP_PRIVATE', 'Private groups require an owner or admin to add you');
  }

  const result = await GroupMemberModel.updateOne(
    { group: id, user: userId },
    { $setOnInsert: { group: id, user: userId, role: 'member' } },
    { upsert: true },
  );
  if (result.upsertedCount > 0 && String(group.creator) !== userId) {
    await createNotification({
      recipientId: String(group.creator),
      actorId: userId,
      type: 'group_join',
      entityId: id,
    });
  }
  return getGroup(id, userId);
}

export async function leaveGroup(id: string, userId: string) {
  const membership = await GroupMemberModel.findOne({ group: id, user: userId });
  if (!membership) throw new AppError(404, 'GROUP_MEMBERSHIP_NOT_FOUND', 'Group membership not found');
  if (membership.role === 'owner') {
    throw new AppError(409, 'GROUP_OWNER_CANNOT_LEAVE', 'Transfer ownership before leaving');
  }
  await membership.deleteOne();
  return { left: true };
}

export async function addMember(id: string, actorId: string, targetUserId: string) {
  const { group } = await requireGroupRole(id, actorId, ['owner', 'admin']);
  if (!await UserModel.exists({ _id: targetUserId, isActive: true })) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Target user not found');
  }
  try {
    const membership = await GroupMemberModel.create({ group: id, user: targetUserId, role: 'member' });
    await createNotification({
      recipientId: targetUserId,
      actorId,
      type: 'group_invite',
      entityId: id,
      content: group.name,
    });
    return membership;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw new AppError(409, 'GROUP_MEMBER_EXISTS', 'User is already a member of this group');
    }
    throw error;
  }
}

export async function updateMemberRole(id: string, actorId: string, targetUserId: string, role: GroupRole) {
  const { membership: actorMembership } = await requireGroupRole(id, actorId, ['owner']);
  const target = await GroupMemberModel.findOne({ group: id, user: targetUserId });
  if (!target) throw new AppError(404, 'GROUP_MEMBERSHIP_NOT_FOUND', 'Group membership not found');

  if (target.role === 'owner' && targetUserId !== actorId) {
    throw new AppError(409, 'GROUP_OWNER_CONFLICT', 'Group already has another owner');
  }

  if (role === 'owner') {
    if (targetUserId === actorId) return target;
    target.role = 'owner';
    await target.save();
    actorMembership.role = 'admin';
    await actorMembership.save();
    return target;
  }

  if (target.role === 'owner') {
    throw new AppError(409, 'GROUP_OWNER_TRANSFER_REQUIRED', 'Transfer ownership instead of demoting the owner');
  }
  target.role = role;
  await target.save();
  return target;
}

export async function removeMember(id: string, actorId: string, targetUserId: string) {
  const { membership: actorMembership } = await requireGroupRole(id, actorId, ['owner', 'admin']);
  const target = await GroupMemberModel.findOne({ group: id, user: targetUserId });
  if (!target) throw new AppError(404, 'GROUP_MEMBERSHIP_NOT_FOUND', 'Group membership not found');
  if (target.role === 'owner') {
    throw new AppError(409, 'GROUP_OWNER_CANNOT_REMOVE', 'Transfer ownership before removing the owner');
  }
  if (actorMembership.role === 'admin' && target.role !== 'member') {
    throw new AppError(403, 'GROUP_PERMISSION_DENIED', 'Admins can remove regular members only');
  }
  await target.deleteOne();
  return { removed: true };
}

export async function listMembers(id: string, page: number, limit: number, viewerId?: string) {
  await requireReadableGroup(id, viewerId);
  const [members, total] = await Promise.all([
    GroupMemberModel.find({ group: id }).sort({ createdAt: 1 })
      .skip((page - 1) * limit).limit(limit)
      .populate('user', 'name username avatarUrl university faculty department').lean(),
    GroupMemberModel.countDocuments({ group: id }),
  ]);
  return {
    items: members.map((member) => ({
      id: String(member._id),
      role: member.role,
      user: member.user,
      joinedAt: member.createdAt,
    })),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

function serializeGroupPost(post: {
  _id: Types.ObjectId;
  group: Types.ObjectId;
  author: unknown;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: post._id.toHexString(),
    groupId: post.group.toHexString(),
    content: post.content,
    author: post.author,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export async function listPosts(id: string, page: number, limit: number, viewerId?: string) {
  await requireReadableGroup(id, viewerId);
  const [posts, total] = await Promise.all([
    GroupPostModel.find({ group: id }).sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(limit)
      .populate('author', 'name username avatarUrl university').lean(),
    GroupPostModel.countDocuments({ group: id }),
  ]);
  return {
    items: posts.map((post) => serializeGroupPost(post)),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

export async function createPost(id: string, userId: string, content: string) {
  await requireReadableGroup(id, userId);
  const member = await GroupMemberModel.exists({ group: id, user: userId });
  if (!member) throw new AppError(403, 'GROUP_MEMBERS_ONLY', 'Join the group before posting');
  const created = await GroupPostModel.create({ group: id, author: userId, content });
  const post = await GroupPostModel.findById(created._id)
    .populate('author', 'name username avatarUrl university').lean();
  if (!post) throw new AppError(404, 'GROUP_POST_NOT_FOUND', 'Group post not found');
  return serializeGroupPost(post);
}

export async function deletePost(id: string, postId: string, userId: string, appRole: Role) {
  const post = await GroupPostModel.findOne({ _id: postId, group: id });
  if (!post) throw new AppError(404, 'GROUP_POST_NOT_FOUND', 'Group post not found');
  if (appRole !== 'admin' && String(post.author) !== userId) {
    const membership = await GroupMemberModel.findOne({ group: id, user: userId }).select('role').lean();
    if (!membership || !['owner', 'admin', 'moderator'].includes(membership.role)) {
      throw new AppError(403, 'GROUP_PERMISSION_DENIED', 'You cannot delete this group post');
    }
  }
  await post.deleteOne();
}

export async function deleteGroup(id: string, actorId: string) {
  await requireGroupRole(id, actorId, ['owner']);
  await Promise.all([
    GroupPostModel.deleteMany({ group: id }),
    GroupMemberModel.deleteMany({ group: id }),
    NotificationModel.deleteMany({ entityId: id, type: { $in: ['group_invite', 'group_join'] } }),
    CommunityGroupModel.deleteOne({ _id: id }),
  ]);
}
