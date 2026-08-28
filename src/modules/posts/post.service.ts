import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import type { Role } from '../users/user.model.js';
import { PostModel } from './post.model.js';
import type { CreatePostInput, ListPostsQuery, UpdatePostInput } from './post.schemas.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function createPost(userId: string, input: CreatePostInput) {
  return PostModel.create({ ...input, author: new Types.ObjectId(userId) });
}

export async function listPublished(query: ListPostsQuery) {
  const filter = {
    status: 'published' as const,
    ...(query.search
      ? { $or: [{ title: { $regex: escapeRegex(query.search), $options: 'i' } }, { content: { $regex: escapeRegex(query.search), $options: 'i' } }] }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).populate('author', 'name').lean(),
    PostModel.countDocuments(filter),
  ]);

  return { items, page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) };
}

export async function listMine(userId: string, query: ListPostsQuery) {
  const filter = {
    author: new Types.ObjectId(userId),
    ...(query.search
      ? { $or: [{ title: { $regex: escapeRegex(query.search), $options: 'i' } }, { content: { $regex: escapeRegex(query.search), $options: 'i' } }] }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    PostModel.countDocuments(filter),
  ]);

  return { items, page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) };
}

export async function getPost(id: string, viewer?: { userId: string; role: Role }) {
  const post = await PostModel.findById(id).lean();
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');

  const authorId = String(post.author);
  const canViewPrivate = viewer && (viewer.role === 'admin' || viewer.userId === authorId);

  if (post.status !== 'published' && !canViewPrivate) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  return post;
}

async function getOwnedPost(id: string, userId: string, role: Role) {
  const post = await PostModel.findById(id);
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  if (role !== 'admin' && String(post.author) !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot modify this post');
  }
  return post;
}

export async function updatePost(id: string, userId: string, role: Role, input: UpdatePostInput) {
  const post = await getOwnedPost(id, userId, role);
  Object.assign(post, input);
  await post.save();
  return post;
}

export async function deletePost(id: string, userId: string, role: Role): Promise<void> {
  const post = await getOwnedPost(id, userId, role);
  await post.deleteOne();
}
