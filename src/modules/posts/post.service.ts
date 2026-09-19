import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { CommentModel } from '../comments/comment.model.js';
import { ReactionModel } from '../reactions/reaction.model.js';
import { reactionSummaries, type ReactionSummary } from '../reactions/reaction.service.js';
import { UserModel, type Role, type University } from '../users/user.model.js';
import { PostModel, type Post } from './post.model.js';
import type { CreatePostInput, ListPostsQuery, UpdatePostInput } from './post.schemas.js';

interface PublicAuthor {
  _id: Types.ObjectId;
  name: string;
  university: University;
  avatarUrl: string | null;
}

interface PopulatedPost extends Omit<Post, 'user'> {
  _id: Types.ObjectId;
  user: PublicAuthor;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emptyEngagement(): ReactionSummary {
  return {
    total: 0,
    counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
    viewerReaction: null,
  };
}

async function decoratePosts(posts: PopulatedPost[], viewerId?: string) {
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
    coverImage: input.coverImage ?? null,
    tags: input.tags,
    publishedAt,
  });
}

export async function listPublished(query: ListPostsQuery, viewerId?: string) {
  const authors = query.university
    ? await UserModel.find({ university: query.university }).select('_id').lean()
    : null;
  const searchPattern = query.search ? new RegExp(escapeRegex(query.search), 'i') : null;
  const filter = {
    status: 'published' as const,
    ...(searchPattern ? { $or: [{ title: searchPattern }, { content: searchPattern }] } : {}),
    ...(query.tag ? { tags: { $in: [query.tag] } } : {}),
    ...(authors ? { user: { $in: authors.map((author) => author._id) } } : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate<{ user: PublicAuthor }>('user', 'name university avatarUrl')
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
  const searchPattern = query.search ? new RegExp(escapeRegex(query.search), 'i') : null;
  const filter = {
    user: new Types.ObjectId(userId),
    ...(query.status ? { status: query.status } : {}),
    ...(searchPattern ? { $or: [{ title: searchPattern }, { content: searchPattern }] } : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate<{ user: PublicAuthor }>('user', 'name university avatarUrl')
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
  const post = await PostModel.findById(id)
    .populate<{ user: PublicAuthor }>('user', 'name university avatarUrl')
    .lean();
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');

  const canViewPrivate = Boolean(
    viewer && (viewer.role === 'admin' || viewer.userId === String(post.user._id)),
  );
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

  if (input.title !== undefined) post.title = input.title;
  if (input.content !== undefined) post.content = input.content;
  if (input.status !== undefined) post.status = input.status;
  if (input.coverImage !== undefined) post.coverImage = input.coverImage;
  if (input.tags !== undefined) post.tags = input.tags;
  if (input.publishedAt !== undefined) post.publishedAt = input.publishedAt;

  await post.save();
  return post;
}

export async function deletePost(id: string, userId: string, role: Role): Promise<void> {
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
