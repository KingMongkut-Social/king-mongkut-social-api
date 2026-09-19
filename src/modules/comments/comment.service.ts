import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { PostModel } from '../posts/post.model.js';
import { ReactionModel } from '../reactions/reaction.model.js';
import { reactionSummaries, type ReactionSummary } from '../reactions/reaction.service.js';
import type { Role, University } from '../users/user.model.js';
import { CommentModel, type Comment } from './comment.model.js';
import type { CreateCommentInput, UpdateCommentInput } from './comment.schemas.js';

interface Viewer {
  userId: string;
  role: Role;
}

interface PublicAuthor {
  _id: Types.ObjectId;
  name: string;
  university: University;
  avatarUrl: string | null;
}

interface PopulatedComment extends Omit<Comment, 'user'> {
  _id: Types.ObjectId;
  user: PublicAuthor;
}

async function assertPostViewable(postId: string, viewer?: Viewer): Promise<void> {
  const post = await PostModel.findById(postId).select('status user').lean();
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');

  const ownerId = String(post.user);
  const canViewPrivate = Boolean(viewer && (viewer.role === 'admin' || viewer.userId === ownerId));
  if (post.status !== 'published' && !canViewPrivate) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  }
}

function publicComment(comment: PopulatedComment, engagement: ReactionSummary) {
  const { user, parentComment, deletedAt, ...rest } = comment;
  const deleted = Boolean(deletedAt);
  return {
    ...rest,
    author: user,
    parentCommentId: parentComment ? String(parentComment) : null,
    content: deleted ? '' : comment.content,
    isDeleted: deleted,
    engagement,
  };
}

export async function listComments(postId: string, viewer?: Viewer) {
  await assertPostViewable(postId, viewer);

  const comments = await CommentModel.find({ post: new Types.ObjectId(postId) })
    .sort({ createdAt: 1 })
    .limit(500)
    .populate<{ user: PublicAuthor }>('user', 'name university avatarUrl')
    .lean();

  const ids = comments.map((comment) => String(comment._id));
  const summaries = await reactionSummaries('comment', ids, viewer?.userId);

  return comments.map((comment) => publicComment(
    comment,
    summaries.get(String(comment._id)) ?? {
      total: 0,
      counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: null,
    },
  ));
}

export async function createComment(postId: string, userId: string, role: Role, input: CreateCommentInput) {
  await assertPostViewable(postId, { userId, role });

  if (input.parentCommentId) {
    const parent = await CommentModel.findOne({
      _id: new Types.ObjectId(input.parentCommentId),
      post: new Types.ObjectId(postId),
      deletedAt: null,
    }).lean();
    if (!parent) throw new AppError(404, 'PARENT_COMMENT_NOT_FOUND', 'Parent comment not found');
  }

  const created = await CommentModel.create({
    post: new Types.ObjectId(postId),
    user: new Types.ObjectId(userId),
    parentComment: input.parentCommentId ? new Types.ObjectId(input.parentCommentId) : null,
    content: input.content,
    deletedAt: null,
  });

  const comment = await CommentModel.findById(created.id)
    .populate<{ user: PublicAuthor }>('user', 'name university avatarUrl')
    .lean();
  if (!comment) throw new AppError(500, 'COMMENT_CREATE_FAILED', 'Comment could not be loaded after creation');

  const summaries = await reactionSummaries('comment', [created.id], userId);
  return publicComment(
    comment,
    summaries.get(created.id) ?? {
      total: 0,
      counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: null,
    },
  );
}

async function getOwnedComment(postId: string, commentId: string, userId: string, role: Role) {
  const comment = await CommentModel.findOne({
    _id: new Types.ObjectId(commentId),
    post: new Types.ObjectId(postId),
  });
  if (!comment) throw new AppError(404, 'COMMENT_NOT_FOUND', 'Comment not found');
  if (role !== 'admin' && String(comment.user) !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot modify this comment');
  }
  return comment;
}

export async function updateComment(
  postId: string,
  commentId: string,
  userId: string,
  role: Role,
  input: UpdateCommentInput,
): Promise<void> {
  const comment = await getOwnedComment(postId, commentId, userId, role);
  if (comment.deletedAt) throw new AppError(409, 'COMMENT_DELETED', 'Deleted comments cannot be edited');
  comment.content = input.content;
  await comment.save();
}

export async function deleteComment(postId: string, commentId: string, userId: string, role: Role): Promise<void> {
  const comment = await getOwnedComment(postId, commentId, userId, role);
  if (!comment.deletedAt) {
    comment.deletedAt = new Date();
    comment.content = '[deleted]';
    await comment.save();
  }
  await ReactionModel.deleteMany({ targetType: 'comment', targetId: comment._id });
}
