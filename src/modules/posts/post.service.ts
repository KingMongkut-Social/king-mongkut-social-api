import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { FriendshipModel } from '../friends/friendship.model.js';
import { UserModel } from '../users/user.model.js';
import type { Role } from '../users/user.model.js';
import { PostBookmarkModel } from './post-bookmark.model.js';
import { PostCommentModel } from './post-comment.model.js';
import { PostLikeModel, type PostReaction } from './post-like.model.js';
import { createNotification } from '../notifications/notification.service.js';
import { PostModel, type PostAttachment } from './post.model.js';
import type { CreateCommentInput, CreatePostInput, ListCommentsQuery, ListPostsQuery, UpdatePostInput } from './post.schemas.js';

type LeanPost = Record<string, unknown> & { _id: Types.ObjectId; user: unknown };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageResult<T>(items: T[], page: number, limit: number, total: number) {
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

function searchFilter(query: Pick<ListPostsQuery, 'search' | 'tag'>): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: pattern }, { content: pattern }];
  }
  if (query.tag) filter.tags = query.tag;
  return filter;
}

async function enrichPosts(posts: LeanPost[], viewerId?: string) {
  if (!posts.length) return [];
  const ids = posts.map((post) => post._id);
  const viewer = viewerId ? new Types.ObjectId(viewerId) : null;
  const [likes, comments, ownLikes, ownBookmarks] = await Promise.all([
    PostLikeModel.aggregate<{ _id: { post: Types.ObjectId; reaction: PostReaction }; count: number }>([
      { $match: { post: { $in: ids } } },
      { $group: { _id: { post: '$post', reaction: { $ifNull: ['$reaction', 'LIKE'] } }, count: { $sum: 1 } } },
    ]),
    PostCommentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { post: { $in: ids } } }, { $group: { _id: '$post', count: { $sum: 1 } } },
    ]),
    viewer ? PostLikeModel.find({ post: { $in: ids }, user: viewer }).select('post reaction').lean() : [],
    viewer ? PostBookmarkModel.find({ post: { $in: ids }, user: viewer }).select('post').lean() : [],
  ]);
  const reactionCountsByPost = new Map<string, Record<PostReaction, number>>();
  for (const item of likes) {
    const postId = String(item._id.post);
    const current = reactionCountsByPost.get(postId) ?? { LIKE: 0, LOVE: 0, HAHA: 0, WOW: 0, SAD: 0, ANGRY: 0 };
    current[item._id.reaction] = item.count;
    reactionCountsByPost.set(postId, current);
  }
  const likeCounts = new Map([...reactionCountsByPost.entries()].map(([id, counts]) => [
    id, Object.values(counts).reduce((sum, count) => sum + count, 0),
  ]));
  const commentCounts = new Map(comments.map((item) => [String(item._id), item.count]));
  const ownReaction = new Map(ownLikes.map((item) => [String(item.post), item.reaction ?? 'LIKE']));
  const liked = new Set(ownReaction.keys());
  const saved = new Set(ownBookmarks.map((item) => String(item.post)));

  return posts.map((post) => {
    const id = String(post._id);
    const likeCount = likeCounts.get(id) ?? 0;
    const commentCount = commentCounts.get(id) ?? 0;
    const images = Array.isArray(post.images)
      ? (post.images as unknown[]).filter((value): value is string => typeof value === 'string') : [];
    const attachments = Array.isArray(post.attachments) ? post.attachments as PostAttachment[] : [];
    return {
      ...post,
      title: typeof post.title === 'string' ? post.title : '',
      images,
      attachments,
      media: [
        ...images.map((url) => ({ url, name: '', mimeType: 'image/*', size: 0 })),
        ...attachments,
      ],
      taggedFriends: Array.isArray(post.taggedFriends) ? post.taggedFriends : [],
      author: post.user,
      likeCount,
      likesCount: likeCount,
      commentCount,
      commentsCount: commentCount,
      likedByMe: liked.has(id),
      myReaction: ownReaction.get(id) ?? null,
      reactionCounts: reactionCountsByPost.get(id) ?? { LIKE: 0, LOVE: 0, HAHA: 0, WOW: 0, SAD: 0, ANGRY: 0 },
      savedByMe: saved.has(id),
    };
  });
}

async function populatedPost(id: string): Promise<LeanPost> {
  const post = await PostModel.findById(id)
    .populate('user', 'name username avatarUrl university faculty department')
    .lean();
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  return post as unknown as LeanPost;
}

function mayRead(post: LeanPost, viewer?: { userId: string; role: Role }): boolean {
  const author = post.user as { _id?: Types.ObjectId } | Types.ObjectId | null;
  const authorId = author instanceof Types.ObjectId ? author.toHexString() : author?._id?.toHexString() ?? '';
  return post.status === 'published' || Boolean(viewer && (viewer.role === 'admin' || viewer.userId === authorId));
}

export async function getPost(id: string, viewer?: { userId: string; role: Role }) {
  const post = await populatedPost(id);
  if (!mayRead(post, viewer)) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  return (await enrichPosts([post], viewer?.userId))[0];
}

function assertContent(value: { content?: string; images?: string[]; attachments?: unknown[]; coverImage?: string | null }) {
  if (!value.content?.trim() && !value.images?.length && !value.attachments?.length && !value.coverImage) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Post needs text or media');
  }
}

async function validateTaggedFriends(userId: string, ids: string[] | undefined): Promise<string[]> {
  const uniqueIds = [...new Set((ids ?? []).map((id) => id.toLowerCase()))];
  if (!uniqueIds.length) return uniqueIds;
  if (uniqueIds.includes(userId)) throw new AppError(422, 'INVALID_TAGGED_FRIEND', 'Cannot tag yourself');
  const [friendships, activeUsers] = await Promise.all([
    FriendshipModel.find({
      status: 'accepted',
      $or: [
        { requester: userId, recipient: { $in: uniqueIds } },
        { recipient: userId, requester: { $in: uniqueIds } },
      ],
    }).select('requester recipient').lean(),
    UserModel.find({ _id: { $in: uniqueIds }, isActive: true }).select('_id').lean(),
  ]);
  const connected = new Set(friendships.map((friendship) =>
    String(friendship.requester) === userId ? String(friendship.recipient) : String(friendship.requester)));
  const active = new Set(activeUsers.map((user) => String(user._id)));
  if (uniqueIds.some((id) => !connected.has(id) || !active.has(id))) {
    throw new AppError(422, 'INVALID_TAGGED_FRIEND', 'Tagged users must be active friends');
  }
  return uniqueIds;
}

export async function createPost(userId: string, input: CreatePostInput) {
  const status = input.status ?? 'published';
  const taggedFriends = await validateTaggedFriends(userId, input.taggedFriends);
  const post = await new PostModel({
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    title: input.title || input.content?.slice(0, 150) || (input.images?.length ? 'รูปภาพ' : 'ไฟล์แนบ'),
    content: input.content ?? '',
    status,
    user: new Types.ObjectId(userId),
    taggedFriends: taggedFriends.map((id) => new Types.ObjectId(id)),
    publishedAt: status === 'published' ? new Date() : null,
  }).save();
  return getPost(String(post._id), { userId, role: 'user' });
}

export async function listPublished(query: ListPostsQuery, viewerId?: string) {
  const filter: Record<string, unknown> = { status: 'published', ...searchFilter(query) };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter).sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip).limit(query.limit).populate('user', 'name username avatarUrl university faculty department').lean(),
    PostModel.countDocuments(filter),
  ]);
  return pageResult(await enrichPosts(items as unknown as LeanPost[], viewerId), query.page, query.limit, total);
}

export async function listPublishedByUser(
  userId: string,
  query: Pick<ListPostsQuery, 'page' | 'limit' | 'search' | 'tag'> & { imagesOnly?: '1' | undefined },
  viewerId?: string,
) {
  const search = searchFilter(query);
  const mediaFilter = {
    $or: [
      { 'images.0': { $exists: true } },
      { coverImage: { $type: 'string', $ne: '' } },
      { 'attachments.mimeType': /^image\//i },
    ],
  };
  const filter: Record<string, unknown> = {
    user: new Types.ObjectId(userId),
    status: 'published',
    ...(query.imagesOnly ? { $and: [search, mediaFilter] } : search),
  };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter).sort({ publishedAt: -1, createdAt: -1, _id: -1 })
      .skip(skip).limit(query.limit).populate('user', 'name username avatarUrl university faculty department').lean(),
    PostModel.countDocuments(filter),
  ]);
  return pageResult(await enrichPosts(items as unknown as LeanPost[], viewerId), query.page, query.limit, total);
}

export async function listPublishedByUniversity(
  university: 'KMITL' | 'KMUTNB' | 'KMUTT',
  query: ListPostsQuery,
  viewerId?: string,
) {
  const users = await UserModel.find({ university, isActive: true }).select('_id').lean();
  const filter: Record<string, unknown> = {
    user: { $in: users.map((user) => user._id) },
    status: 'published',
    ...searchFilter(query),
  };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter).sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip).limit(query.limit).populate('user', 'name username avatarUrl university faculty department').lean(),
    PostModel.countDocuments(filter),
  ]);
  return pageResult(await enrichPosts(items as unknown as LeanPost[], viewerId), query.page, query.limit, total);
}

export async function listMine(userId: string, query: ListPostsQuery) {
  const filter = { user: new Types.ObjectId(userId), ...(query.status ? { status: query.status } : {}), ...searchFilter(query) };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit)
      .populate('user', 'name username avatarUrl university faculty department').lean(),
    PostModel.countDocuments(filter),
  ]);
  return pageResult(await enrichPosts(items as unknown as LeanPost[], userId), query.page, query.limit, total);
}

export async function listBookmarks(userId: string, query: ListPostsQuery) {
  const bookmarks = await PostBookmarkModel.find({ user: userId }).sort({ createdAt: -1, _id: -1 }).select('post').lean();
  if (!bookmarks.length) return pageResult([], query.page, query.limit, 0);
  const postIds = bookmarks.map((bookmark) => bookmark.post);
  const posts = await PostModel.find({ _id: { $in: postIds }, status: 'published', ...searchFilter(query) })
    .populate('user', 'name username avatarUrl university faculty department').lean();
  const byId = new Map(posts.map((post) => [String(post._id), post]));
  const ordered = bookmarks.flatMap((bookmark) => {
    const post = byId.get(String(bookmark.post));
    return post ? [post] : [];
  });
  const total = ordered.length;
  const slice = ordered.slice((query.page - 1) * query.limit, query.page * query.limit);
  return pageResult(await enrichPosts(slice as unknown as LeanPost[], userId), query.page, query.limit, total);
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
  const taggedFriends = input.taggedFriends ? await validateTaggedFriends(String(post.user), input.taggedFriends) : undefined;
  Object.assign(post, input);
  if (taggedFriends) post.taggedFriends = taggedFriends.map((friendId) => new Types.ObjectId(friendId));
  assertContent(post);
  if (input.status === 'published' && !post.publishedAt) post.publishedAt = new Date();
  if (input.status === 'draft') post.publishedAt = null;
  await post.save();
  return getPost(id, { userId, role });
}

export async function deletePost(id: string, userId: string, role: Role) {
  const post = await getOwnedPost(id, userId, role);
  await post.deleteOne();
  await Promise.all([
    PostLikeModel.deleteMany({ post: post._id }),
    PostBookmarkModel.deleteMany({ post: post._id }),
    PostCommentModel.deleteMany({ post: post._id }),
  ]);
}

async function requirePublished(id: string) {
  if (!await PostModel.exists({ _id: id, status: 'published' })) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  }
}

function duplicateKey(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 11000;
}

export async function setReaction(id: string, userId: string, reaction: PostReaction | null, role: Role) {
  await requirePublished(id);
  const before = await PostLikeModel.findOne({ post: id, user: userId }).select('reaction').lean();
  if (reaction) {
    try {
      await PostLikeModel.updateOne(
        { post: id, user: userId },
        { $set: { reaction }, $setOnInsert: { post: id, user: userId } },
        { upsert: true },
      );
    } catch (error) {
      if (!duplicateKey(error)) throw error;
    }
  } else {
    await PostLikeModel.deleteOne({ post: id, user: userId });
  }
  const post = await getPost(id, { userId, role });
  const author = post?.author as { _id?: Types.ObjectId } | undefined;
  const authorId = author?._id ? String(author._id) : '';
  if (reaction && authorId && authorId !== userId && (!before || before.reaction !== reaction)) {
    await createNotification({ recipientId: authorId, actorId: userId, type: 'post_reaction', entityId: id, content: reaction });
  }
  return post;
}

export async function setLike(id: string, userId: string, enabled: boolean, role: Role) {
  return setReaction(id, userId, enabled ? 'LIKE' : null, role);
}

export async function setBookmark(id: string, userId: string, enabled: boolean, role: Role) {
  await requirePublished(id);
  if (enabled) {
    try {
      await PostBookmarkModel.updateOne({ post: id, user: userId }, { $setOnInsert: { post: id, user: userId } }, { upsert: true });
    } catch (error) {
      if (!duplicateKey(error)) throw error;
    }
  } else {
    await PostBookmarkModel.deleteOne({ post: id, user: userId });
  }
  return getPost(id, { userId, role });
}

export async function listComments(id: string, query: ListCommentsQuery, viewer?: { userId: string; role: Role }) {
  await getPost(id, viewer);
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PostCommentModel.find({ post: id }).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(query.limit)
      .populate('author', 'name username avatarUrl university faculty department').lean(),
    PostCommentModel.countDocuments({ post: id }),
  ]);
  return pageResult(items, query.page, query.limit, total);
}

export async function addComment(id: string, userId: string, input: CreateCommentInput) {
  await requirePublished(id);
  let parentId = input.parentId ?? null;
  if (parentId) {
    const parent = await PostCommentModel.findOne({ _id: parentId, post: id }).select('parentId').lean();
    if (!parent) throw new AppError(404, 'COMMENT_NOT_FOUND', 'Parent comment not found');
    parentId = parent.parentId ? String(parent.parentId) : parentId;
  }
  const comment = await PostCommentModel.create({
    post: id,
    author: userId,
    content: input.content,
    parentId,
  });
  const populated = await PostCommentModel.findById(comment.id)
    .populate('author', 'name username avatarUrl university faculty department').lean();

  let recipientId = '';
  let notificationType: 'post_comment' | 'comment_reply' = 'post_comment';
  if (parentId) {
    const parent = await PostCommentModel.findById(parentId).select('author').lean();
    if (parent) recipientId = String(parent.author);
    notificationType = 'comment_reply';
  } else {
    const post = await PostModel.findById(id).select('user').lean();
    if (post) recipientId = String(post.user);
  }
  if (recipientId && recipientId !== userId) {
    await createNotification({
      recipientId,
      actorId: userId,
      type: notificationType,
      entityId: id,
      content: input.content.slice(0, 160),
    });
  }
  return populated;
}

export async function deleteComment(postId: string, commentId: string, userId: string, role: Role) {
  const comment = await PostCommentModel.findOne({ _id: commentId, post: postId });
  if (!comment) throw new AppError(404, 'COMMENT_NOT_FOUND', 'Comment not found');
  const post = await PostModel.findById(postId);
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  if (role !== 'admin' && String(comment.author) !== userId && String(post.user) !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot delete this comment');
  }
  await comment.deleteOne();
  await PostCommentModel.updateMany({ post: postId, parentId: commentId }, { $set: { parentId: null } });
}
