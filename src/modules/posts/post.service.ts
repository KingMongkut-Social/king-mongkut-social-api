import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import type { Role } from '../users/user.model.js';
import { PostModel } from './post.model.js';
import type { CreatePostInput, ListPostsQuery, UpdatePostInput } from './post.schemas.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function createPost(userId: string, input: CreatePostInput) {
  const publishedAt = input.status === 'published' ? (input.publishedAt ?? new Date()) : null;

  return PostModel.create({
    ...input,
    user: new Types.ObjectId(userId),
    publishedAt,
  });
}

export async function listPublished(query: ListPostsQuery) {
  const filter: Record<string, unknown> = {
    status: 'published',
  };

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: pattern }, { content: pattern }];
  }

  if (query.tag) {
    filter.tags = query.tag;
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate('user', 'name university faculty department')
      .lean(),
    PostModel.countDocuments(filter),
  ]);

  return { items, page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) };
}

export async function listMine(userId: string, query: ListPostsQuery) {
  const filter: Record<string, unknown> = {
    user: new Types.ObjectId(userId),
  };

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: pattern }, { content: pattern }];
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    PostModel.countDocuments(filter),
  ]);

  return { items, page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) };
}

export async function getPost(id: string, viewer?: { userId: string; role: Role }) {
  const post = await PostModel.findById(id).populate<{ user: { _id: Types.ObjectId; name: string; university: string; faculty?: string; department?: string } | null }>('user', 'name university faculty department').lean();
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');

  const authorId = post.user ? String(post.user._id) : '';
  const canViewPrivate = Boolean(viewer && (viewer.role === 'admin' || viewer.userId === authorId));

  if (post.status !== 'published' && !canViewPrivate) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  return post;
}

async function getOwnedPost(id: string, userId: string, role: Role) {
  const post = await PostModel.findById(id);
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  if (role !== 'admin' && String(post.user) !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot modify this post');
  }
  return post;
}

export async function updatePost(id: string, userId: string, role: Role, input: UpdatePostInput) {
  const post = await getOwnedPost(id, userId, role);

  if (input.status === 'published' && !post.publishedAt) {
    post.publishedAt = new Date();
  }

  Object.assign(post, input);
  await post.save();
  return post;
}

export async function deletePost(id: string, userId: string, role: Role) {
  const post = await getOwnedPost(id, userId, role);
  await post.deleteOne();
}