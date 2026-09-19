import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { CommentModel } from '../comments/comment.model.js';
import { ReactionModel } from '../reactions/reaction.model.js';
import { reactionSummaries, type ReactionSummary } from '../reactions/reaction.service.js';
import { UserModel, type Role } from '../users/user.model.js';
import { PostModel } from './post.model.js';
import type { CreatePostInput, ListPostsQuery, UpdatePostInput } from './post.schemas.js';

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
}

function idOf(value: unknown): string {
  if (value && typeof value === 'object' && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function emptyEngagement(): ReactionSummary {
  return {
    total: 0,
    counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
    viewerReaction: null,
  };
}

async function decoratePosts(posts: any[], viewerId?: string) {
  const ids = posts.map((post) => String(post._id));
  if (ids.length === 0) return [];

  const objectIds = ids.map((id) => new Types.ObjectId(id));
  const [reactionMap, commentGroups] = await Promise.all([
    reactionSummaries('post', ids, viewerId),
    CommentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { post: { $in: objectIds } } },
      { $group: { _id: '$post', count: { $sum: 1 } } },
    ]),
  ]);

  const commentCounts = new Map(commentGroups.map((entry) => [String(entry._id), entry.count]));

  return posts.map((post) => {
    const { user, ...rest } = post;
    return {
      ...rest,
      author: user,
      engagement: {
        ...(reactionMap.get(String(post._id)) ?? emptyEngagement()),
        commentCount: commentCounts.get(String(post._id)) ?? 0,
      },
    };
  });
}

function derivedTitle(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const normalized = firstLine || 'Untitled post';
  return normalized.length > 150 ? normalized.slice(0, 147) + '...' : normalized;
}

export async function createPost(userId: string, input: CreatePostInput) {
  const publishedAt = input.status === 'published' ? (input.publishedAt ?? new Date()) : null;

  return PostModel.create({
    ...input,
    title: input.title?.trim() || derivedTitle(input.content),
    user: new Types.ObjectId(userId),
    publishedAt,
  });
}

export async function listPublished(query: ListPostsQuery, viewerId?: string) {
  const filter: any = { status: 'published' };

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: pattern }, { content: pattern }];
  }
  if (query.tag) filter.tags = query.tag;
  if (query.university) {
    const universityUsers = await UserModel.find({ university: query.university }).distinct('_id');
    filter.user = { $in: universityUsers };
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate('user', 'name university avatarUrl')
      .lean(),
    PostModel.countDocuments(filter),
  ]);

  return {
    items: await decoratePosts(items, viewerId),
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.ceil(total / query.limit),
  };
}

export async function listMine(userId: string, query: ListPostsQuery) {
  const filter: any = { user: new Types.ObjectId(userId) };

  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: pattern }, { content: pattern }];
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate('user', 'name university avatarUrl')
      .lean(),
    PostModel.countDocuments(filter),
  ]);

  return {
    items: await decoratePosts(items, userId),
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.ceil(total / query.limit),
  };
}

export async function getPost(id: string, viewer?: { userId: string; role: Role }) {
  const post = await PostModel.findById(id).populate('user', 'name university avatarUrl').lean();
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');

  const authorId = idOf(post.user);
  const canViewPrivate = Boolean(viewer && (viewer.role === 'admin' || viewer.userId === authorId));
  if (post.status !== 'published' && !canViewPrivate) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  }

  const decorated = await decoratePosts([post], viewer?.userId);
  return decorated[0];
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

  if (input.status === 'published' && !post.publishedAt) post.publishedAt = new Date();
  if (input.status === 'draft') post.publishedAt = null;

  Object.assign(post, input);
  await post.save();
  return post;
}

export async function deletePost(id: string, userId: string, role: Role) {
  const post = await getOwnedPost(id, userId, role);
  const comments = await CommentModel.find({ post: post._id }).select('_id').lean();
  const commentIds = comments.map((comment) => comment._id);

  await Promise.all([
    ReactionModel.deleteMany({ targetType: 'post', targetId: post._id }),
    ReactionModel.deleteMany({ targetType: 'comment', targetId: { $in: commentIds } }),
    CommentModel.deleteMany({ post: post._id }),
    post.deleteOne(),
  ]);
}
