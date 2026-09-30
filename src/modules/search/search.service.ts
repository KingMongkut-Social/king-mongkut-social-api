import { CommunityGroupModel } from '../groups/group.model.js';
import { GroupMemberModel } from '../groups/group-member.model.js';
import * as postService from '../posts/post.service.js';
import { listUniversities } from '../universities/university.service.js';
import { UserModel } from '../users/user.model.js';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

export interface SearchOptions {
  q: string;
  type?: 'all' | 'users' | 'posts' | 'groups' | 'universities' | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}


export async function search(
  queryOrQ: string | SearchOptions,
  limitOrViewerId?: number | string,
  viewerId?: string,
) {
  const options: SearchOptions = typeof queryOrQ === 'string'
    ? {
      q: queryOrQ,
      type: 'all',
      page: 1,
      limit: typeof limitOrViewerId === 'number' ? limitOrViewerId : 8,
    }
    : {
      q: queryOrQ.q,
      type: queryOrQ.type ?? 'all',
      page: queryOrQ.page ?? 1,
      limit: queryOrQ.limit ?? 8,
    };

  const currentViewerId = typeof queryOrQ === 'string'
    ? (typeof limitOrViewerId === 'string' ? limitOrViewerId : viewerId)
    : (typeof limitOrViewerId === 'string' ? limitOrViewerId : viewerId);

  const { q, type = 'all', page = 1, limit = 8 } = options;
  const pattern = new RegExp(escapeRegex(q), 'i');
  const lower = q.toLowerCase();

  if (type === 'users') {
    const filter = {
      isActive: true,
      $or: [{ name: pattern }, { username: pattern }, { faculty: pattern }, { department: pattern }],
    };
    const [rawUsers, total] = await Promise.all([
      UserModel.find(filter)
        .select('name username avatarUrl university faculty department')
        .sort({ name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter),
    ]);
    const users = rawUsers.map((user) => ({
      id: String(user._id),
      name: user.name,
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
      university: user.university,
      faculty: user.faculty,
      department: user.department,
    }));
    return {
      items: users,
      users,
      posts: [],
      groups: [],
      universities: [],
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  if (type === 'posts') {
    const postsResult = await postService.listPublished({ page, limit, search: q }, currentViewerId);
    return {
      items: postsResult.items,
      users: [],
      posts: postsResult.items,
      groups: [],
      universities: [],
      page: postsResult.page,
      limit: postsResult.limit,
      total: postsResult.total,
      pages: postsResult.pages,
    };
  }

  if (type === 'groups') {
    const filter = {
      privacy: 'public' as const,
      $or: [{ name: pattern }, { description: pattern }],
    };
    const [rawGroups, total] = await Promise.all([
      CommunityGroupModel.find(filter)
        .select('name description coverUrl university')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CommunityGroupModel.countDocuments(filter),
    ]);
    const memberCounts = await Promise.all(
      rawGroups.map((group) => GroupMemberModel.countDocuments({ group: group._id })),
    );
    const groups = rawGroups.map((group, idx) => ({
      id: String(group._id),
      name: group.name,
      description: group.description,
      coverUrl: group.coverUrl ?? null,
      university: group.university ?? null,
      memberCount: memberCounts[idx] ?? 0,
    }));
    return {
      items: groups,
      users: [],
      posts: [],
      groups,
      universities: [],
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  if (type === 'universities') {
    const allUnis = await listUniversities();
    const filtered = allUnis.filter((university) =>
      university.code.toLowerCase().includes(lower)
      || university.name.toLowerCase().includes(lower));
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit);
    return {
      items,
      users: [],
      posts: [],
      groups: [],
      universities: items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  // Default: type === 'all'
  const [users, posts, rawGroups, universities] = await Promise.all([
    UserModel.find({
      isActive: true,
      $or: [{ name: pattern }, { username: pattern }, { faculty: pattern }, { department: pattern }],
    }).select('name username avatarUrl university faculty department').limit(limit).lean(),
    postService.listPublished({ page: 1, limit, search: q }, currentViewerId),
    CommunityGroupModel.find({
      privacy: 'public',
      $or: [{ name: pattern }, { description: pattern }],
    }).select('name description coverUrl university').limit(limit).lean(),
    listUniversities(),
  ]);

  const memberCounts = await Promise.all(
    rawGroups.map((group) => GroupMemberModel.countDocuments({ group: group._id })),
  );

  return {
    users: users.map((user) => ({
      id: String(user._id),
      name: user.name,
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
      university: user.university,
      faculty: user.faculty,
      department: user.department,
    })),
    posts: posts.items,
    groups: rawGroups.map((group, idx) => ({
      id: String(group._id),
      name: group.name,
      description: group.description,
      coverUrl: group.coverUrl ?? null,
      university: group.university ?? null,
      memberCount: memberCounts[idx] ?? 0,
    })),
    universities: universities.filter((university) =>
      university.code.toLowerCase().includes(lower)
      || university.name.toLowerCase().includes(lower)),
  };
}

