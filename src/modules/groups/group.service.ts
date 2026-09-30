import { AppError } from '../../common/errors/app-error.js';
import { createNotification } from '../notifications/notification.service.js';
import { CommunityGroupModel } from './group.model.js';
import { GroupMemberModel } from './group-member.model.js';
import { GroupPostModel } from './group-post.model.js';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

async function serializeGroup(group: any, viewerId?: string) {
  const [memberCount, membership] = await Promise.all([
    GroupMemberModel.countDocuments({ group: group._id }),
    viewerId
      ? GroupMemberModel.findOne({ group: group._id, user: viewerId }).select('role').lean()
      : null,
  ]);
  return {
    id: String(group._id),
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

export async function listGroups(
  query: { q?: string; university?: string; page: number; limit: number },
  viewerId?: string,
) {
  const filter: Record<string, unknown> = { privacy: 'public' };
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { description: pattern }];
  }
  if (query.university) filter.university = query.university;
  const [groups, total] = await Promise.all([
    CommunityGroupModel.find(filter).sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('creator', 'name username avatarUrl university').lean(),
    CommunityGroupModel.countDocuments(filter),
  ]);
  return {
    items: await Promise.all(groups.map((group) => serializeGroup(group, viewerId))),
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.ceil(total / query.limit),
  };
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
  const group = await CommunityGroupModel.create({ ...input, creator: userId });
  await GroupMemberModel.create({ group: group._id, user: userId, role: 'owner' });
  const populated = await CommunityGroupModel.findById(group._id)
    .populate('creator', 'name username avatarUrl university').lean();
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
    throw new AppError(403, 'GROUP_PRIVATE', 'Private groups require an invitation');
  }
  await GroupMemberModel.updateOne(
    { group: id, user: userId },
    { $setOnInsert: { group: id, user: userId, role: 'member' } },
    { upsert: true },
  );
  if (String(group.creator) !== userId) {
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

export async function listMembers(id: string, page: number, limit: number) {
  if (!await CommunityGroupModel.exists({ _id: id })) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  }
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

export async function listPosts(id: string, page: number, limit: number) {
  if (!await CommunityGroupModel.exists({ _id: id })) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  }
  const [posts, total] = await Promise.all([
    GroupPostModel.find({ group: id }).sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(limit)
      .populate('author', 'name username avatarUrl university').lean(),
    GroupPostModel.countDocuments({ group: id }),
  ]);
  return {
    items: posts.map((post) => ({
      id: String(post._id),
      content: post.content,
      author: post.author,
      createdAt: post.createdAt,
    })),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

export async function createPost(id: string, userId: string, content: string) {
  const member = await GroupMemberModel.exists({ group: id, user: userId });
  if (!member) throw new AppError(403, 'GROUP_MEMBERS_ONLY', 'Join the group before posting');
  const post = await GroupPostModel.create({ group: id, author: userId, content });
  return GroupPostModel.findById(post._id)
    .populate('author', 'name username avatarUrl university').lean();
}
