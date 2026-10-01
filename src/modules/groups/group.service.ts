import { AppError } from '../../common/errors/app-error.js';
import { createNotification } from '../notifications/notification.service.js';
import { UserModel } from '../users/user.model.js';
import { CommunityGroupModel } from './group.model.js';
import { GroupInviteModel } from './group-invite.model.js';
import { GroupMemberModel } from './group-member.model.js';
import { GroupPostModel } from './group-post.model.js';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

type GroupView = {
  _id: unknown;
  name: string;
  description: string;
  coverUrl?: string | null;
  privacy: 'public' | 'private';
  university?: 'KMITL' | 'KMUTT' | 'KMUTNB' | null;
  creator: unknown;
  createdAt: Date;
};

async function serializeGroup(group: GroupView, viewerId?: string) {
  const groupId = String(group._id);
  const [memberCount, membership] = await Promise.all([
    GroupMemberModel.countDocuments({ group: groupId }),
    viewerId
      ? GroupMemberModel.findOne({ group: groupId, user: viewerId }).select('role').lean()
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
    items: await Promise.all(groups.map((group) => serializeGroup(group as unknown as GroupView, viewerId))),
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

export async function updateGroup(
  id: string,
  userId: string,
  input: { name?: string; description?: string },
) {
  const membership = await GroupMemberModel.findOne({ group: id, user: userId }).select('role').lean();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new AppError(403, 'GROUP_MANAGE_FORBIDDEN', 'Only group owners and admins can edit this group');
  }

  const group = await CommunityGroupModel.findByIdAndUpdate(
    id,
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  ).populate('creator', 'name username avatarUrl university').lean();

  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  return serializeGroup(group, userId);
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

export async function listMembers(
  id: string,
  page: number,
  limit: number,
  viewerId?: string,
  query = '',
) {
  await requireReadableGroup(id, viewerId);

  const filter: Record<string, unknown> = { group: id };
  const cleanQuery = query.trim();
  if (cleanQuery) {
    const pattern = new RegExp(escapeRegex(cleanQuery), 'i');
    const matchingUsers = await UserModel.find({
      isActive: true,
      $or: [{ name: pattern }, { username: pattern }],
    }).select('_id').limit(200).lean();
    filter.user = { $in: matchingUsers.map((user) => user._id) };
  }

  const [members, total] = await Promise.all([
    GroupMemberModel.find(filter).sort({ createdAt: 1 })
      .skip((page - 1) * limit).limit(limit)
      .populate('user', 'name username avatarUrl university faculty department').lean(),
    GroupMemberModel.countDocuments(filter),
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

export async function listPosts(id: string, page: number, limit: number, viewerId?: string) {
  await requireReadableGroup(id, viewerId);
  const [posts, total] = await Promise.all([
    GroupPostModel.find({ group: id }).sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(limit)
      .populate('author', 'name username avatarUrl university')
      .populate('mentions', 'name username avatarUrl university').lean(),
    GroupPostModel.countDocuments({ group: id }),
  ]);
  return {
    items: posts.map((post) => ({
      id: String(post._id),
      content: post.content,
      author: post.author,
      mentions: post.mentions ?? [],
      createdAt: post.createdAt,
    })),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

export async function createPost(id: string, userId: string, content: string, mentions: string[] = []) {
  const [group, member] = await Promise.all([
    CommunityGroupModel.findById(id).select('name').lean(),
    GroupMemberModel.exists({ group: id, user: userId }),
  ]);
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  if (!member) throw new AppError(403, 'GROUP_MEMBERS_ONLY', 'Join the group before posting');

  const uniqueMentions = [...new Set(mentions)];
  if (uniqueMentions.length) {
    const [mentionedMemberships, activeUsers] = await Promise.all([
      GroupMemberModel.find({ group: id, user: { $in: uniqueMentions } }).select('user').lean(),
      UserModel.find({ _id: { $in: uniqueMentions }, isActive: true }).select('_id').lean(),
    ]);
    const memberIds = new Set(mentionedMemberships.map((item) => String(item.user)));
    const activeIds = new Set(activeUsers.map((item) => String(item._id)));
    const invalidMention = uniqueMentions.find((mentionId) => !memberIds.has(mentionId) || !activeIds.has(mentionId));
    if (invalidMention) {
      throw new AppError(400, 'GROUP_MENTION_INVALID', 'Mentioned users must be active members of the group');
    }
  }

  const post = await GroupPostModel.create({
    group: id,
    author: userId,
    content,
    mentions: uniqueMentions,
  });

  await Promise.all(uniqueMentions
    .filter((mentionId) => mentionId !== userId)
    .map((mentionId) => createNotification({
      recipientId: mentionId,
      actorId: userId,
      type: 'group_mention',
      entityId: id,
      content: group.name,
    })));

  return GroupPostModel.findById(post._id)
    .populate('author', 'name username avatarUrl university')
    .populate('mentions', 'name username avatarUrl university').lean();
}


export async function listMyGroups(userId: string, page: number, limit: number) {
  const [memberships, total] = await Promise.all([
    GroupMemberModel.find({ user: userId }).sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).select('group').lean(),
    GroupMemberModel.countDocuments({ user: userId }),
  ]);
  const groupIds = memberships.map((membership) => membership.group);
  const groups = await CommunityGroupModel.find({ _id: { $in: groupIds } })
    .populate('creator', 'name username avatarUrl university').lean();
  const byId = new Map(groups.map((group) => [String(group._id), group]));
  const ordered = memberships.flatMap((membership) => {
    const group = byId.get(String(membership.group));
    return group ? [group] : [];
  });
  return {
    items: await Promise.all(ordered.map((group) => serializeGroup(group as unknown as GroupView, userId))),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

export async function listInvitations(userId: string) {
  const invitations = await GroupInviteModel.find({ user: userId, status: 'pending' })
    .sort({ createdAt: -1 })
    .populate('group', 'name description coverUrl privacy university creator createdAt')
    .populate('invitedBy', 'name username avatarUrl university')
    .lean();

  return invitations.flatMap((invitation) => {
    const group = invitation.group && typeof invitation.group === 'object'
      ? invitation.group as unknown as GroupView
      : null;
    if (!group) return [];
    return [{
      id: String(invitation._id),
      group: {
        id: String(group._id),
        name: group.name,
        description: group.description,
        coverUrl: group.coverUrl ?? null,
        privacy: group.privacy,
        university: group.university ?? null,
      },
      invitedBy: invitation.invitedBy,
      createdAt: invitation.createdAt,
    }];
  });
}

export async function inviteMember(groupId: string, inviterId: string, targetUserId: string) {
  if (inviterId === targetUserId) throw new AppError(400, 'BAD_REQUEST', 'Cannot invite yourself');

  const group = await CommunityGroupModel.findById(groupId).lean();
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
  if (group.privacy !== 'private') {
    throw new AppError(409, 'GROUP_INVITE_NOT_REQUIRED', 'Public groups do not require invitations');
  }

  const [inviterMembership, targetExists, existingMember, existingInvite] = await Promise.all([
    GroupMemberModel.findOne({ group: groupId, user: inviterId }).select('role').lean(),
    UserModel.exists({ _id: targetUserId, isActive: true }),
    GroupMemberModel.exists({ group: groupId, user: targetUserId }),
    GroupInviteModel.findOne({ group: groupId, user: targetUserId }),
  ]);

  if (!inviterMembership || !['owner', 'admin'].includes(inviterMembership.role)) {
    throw new AppError(403, 'GROUP_INVITE_FORBIDDEN', 'Only group owners and admins can invite members');
  }
  if (!targetExists) throw new AppError(404, 'USER_NOT_FOUND', 'Target user not found');
  if (existingMember) throw new AppError(409, 'GROUP_ALREADY_MEMBER', 'User is already a member');
  if (existingInvite?.status === 'pending') {
    throw new AppError(409, 'GROUP_INVITE_PENDING', 'An invitation is already pending');
  }

  const invitation = existingInvite
    ? await GroupInviteModel.findOneAndUpdate(
      { _id: existingInvite._id },
      { $set: { invitedBy: inviterId, status: 'pending' } },
      { returnDocument: 'after', runValidators: true },
    )
    : await GroupInviteModel.create({
      group: groupId,
      user: targetUserId,
      invitedBy: inviterId,
      status: 'pending',
    });

  if (!invitation) throw new AppError(500, 'GROUP_INVITE_FAILED', 'Could not create group invitation');

  await createNotification({
    recipientId: targetUserId,
    actorId: inviterId,
    type: 'group_invite',
    entityId: groupId,
    content: group.name,
  });

  return {
    id: String(invitation._id),
    groupId,
    userId: targetUserId,
    status: invitation.status,
    createdAt: invitation.createdAt,
  };
}

export async function respondInvitation(
  inviteId: string,
  userId: string,
  action: 'accept' | 'reject',
) {
  const invitation = await GroupInviteModel.findOneAndUpdate(
    { _id: inviteId, user: userId, status: 'pending' },
    { $set: { status: action === 'accept' ? 'accepted' : 'rejected' } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!invitation) {
    const existing = await GroupInviteModel.findById(inviteId);
    if (!existing) throw new AppError(404, 'GROUP_INVITE_NOT_FOUND', 'Group invitation not found');
    if (String(existing.user) !== userId) throw new AppError(403, 'FORBIDDEN', 'Cannot respond to this invitation');
    throw new AppError(409, 'GROUP_INVITE_HANDLED', 'Group invitation has already been handled');
  }

  if (action === 'accept') {
    await GroupMemberModel.updateOne(
      { group: invitation.group, user: userId },
      { $setOnInsert: { group: invitation.group, user: userId, role: 'member' } },
      { upsert: true },
    );
    const group = await CommunityGroupModel.findById(invitation.group).lean();
    if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group no longer exists');
    if (String(group.creator) !== userId) {
      await createNotification({
        recipientId: String(group.creator),
        actorId: userId,
        type: 'group_join',
        entityId: String(group._id),
      });
    }
  }

  return {
    id: String(invitation._id),
    groupId: String(invitation.group),
    status: invitation.status,
  };
}
