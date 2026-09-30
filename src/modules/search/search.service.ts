import { CommunityGroupModel } from '../groups/group.model.js';
import * as postService from '../posts/post.service.js';
import { listUniversities } from '../universities/university.service.js';
import { UserModel } from '../users/user.model.js';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

export async function search(q: string, limit: number, viewerId?: string) {
  const pattern = new RegExp(escapeRegex(q), 'i');
  const [users, posts, groups, universities] = await Promise.all([
    UserModel.find({
      isActive: true,
      $or: [{ name: pattern }, { username: pattern }, { faculty: pattern }, { department: pattern }],
    }).select('name username avatarUrl university faculty department').limit(limit).lean(),
    postService.listPublished({ page: 1, limit, search: q }, viewerId),
    CommunityGroupModel.find({
      privacy: 'public',
      $or: [{ name: pattern }, { description: pattern }],
    }).select('name description coverUrl university').limit(limit).lean(),
    listUniversities(),
  ]);

  const lower = q.toLowerCase();
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
    groups: groups.map((group) => ({
      id: String(group._id),
      name: group.name,
      description: group.description,
      coverUrl: group.coverUrl ?? null,
      university: group.university ?? null,
    })),
    universities: universities.filter((university) =>
      university.code.toLowerCase().includes(lower)
      || university.name.toLowerCase().includes(lower)),
  };
}
