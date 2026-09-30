import { AppError } from '../../common/errors/app-error.js';
import { PostModel } from '../posts/post.model.js';
import type { ListPostsQuery } from '../posts/post.schemas.js';
import * as postService from '../posts/post.service.js';
import { UserModel } from '../users/user.model.js';
import type { UniversityCode } from './university.schemas.js';

const catalog: Record<UniversityCode, { code: UniversityCode; shortName: string; name: string }> = {
  KMITL: { code: 'KMITL', shortName: 'KMITL', name: "King Mongkut's Institute of Technology Ladkrabang" },
  KMUTT: { code: 'KMUTT', shortName: 'KMUTT', name: "King Mongkut's University of Technology Thonburi" },
  KMUTNB: { code: 'KMUTNB', shortName: 'KMUTNB', name: "King Mongkut's University of Technology North Bangkok" },
};

async function stats(code: UniversityCode) {
  const users = await UserModel.find({ university: code, isActive: true }).select('_id').lean();
  const memberIds = users.map((user) => user._id);
  const postCount = await PostModel.countDocuments({ user: { $in: memberIds }, status: 'published' });
  return { memberCount: memberIds.length, postCount };
}

export async function listUniversities() {
  return Promise.all((Object.keys(catalog) as UniversityCode[]).map(async (code) => ({
    ...catalog[code],
    ...(await stats(code)),
  })));
}

export async function getUniversity(code: UniversityCode) {
  const university = catalog[code];
  if (!university) throw new AppError(404, 'UNIVERSITY_NOT_FOUND', 'University not found');
  return { ...university, ...(await stats(code)) };
}

export function listUniversityPosts(code: UniversityCode, query: ListPostsQuery, viewerId?: string) {
  return postService.listPublishedByUniversity(code, query, viewerId);
}

export async function listMembers(code: UniversityCode, page: number, limit: number) {
  const [items, total] = await Promise.all([
    UserModel.find({ university: code, isActive: true })
      .select('name username avatarUrl university faculty department')
      .sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    UserModel.countDocuments({ university: code, isActive: true }),
  ]);
  return {
    items: items.map((user) => ({
      id: String(user._id),
      name: user.name,
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
      university: user.university,
      faculty: user.faculty,
      department: user.department,
    })),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}
