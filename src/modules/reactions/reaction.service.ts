import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { CommentModel } from '../comments/comment.model.js';
import { PostModel } from '../posts/post.model.js';
import { REACTION_TYPES, ReactionModel, type ReactionTargetType, type ReactionType } from './reaction.model.js';

export interface ReactionSummary {
  total: number;
  counts: Record<ReactionType, number>;
  viewerReaction: ReactionType | null;
}

function emptyCounts(): Record<ReactionType, number> {
  return { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
}

async function assertTargetExists(targetType: ReactionTargetType, targetId: string): Promise<void> {
  const targetObjectId = new Types.ObjectId(targetId);
  const exists = targetType === 'post'
    ? await PostModel.exists({ _id: targetObjectId, status: 'published' })
    : await CommentModel.exists({ _id: targetObjectId, deletedAt: null });

  if (!exists) throw new AppError(404, 'REACTION_TARGET_NOT_FOUND', 'Reaction target not found');
}

export async function reactionSummaries(
  targetType: ReactionTargetType,
  targetIds: string[],
  viewerId?: string,
): Promise<Map<string, ReactionSummary>> {
  const summaries = new Map<string, ReactionSummary>();
  for (const id of targetIds) {
    summaries.set(id, { total: 0, counts: emptyCounts(), viewerReaction: null });
  }
  if (targetIds.length === 0) return summaries;

  const objectIds = targetIds.map((id) => new Types.ObjectId(id));
  const [groups, viewerReactions] = await Promise.all([
    ReactionModel.aggregate<{ _id: { targetId: Types.ObjectId; type: ReactionType }; count: number }>([
      { $match: { targetType, targetId: { $in: objectIds } } },
      { $group: { _id: { targetId: '$targetId', type: '$type' }, count: { $sum: 1 } } },
    ]),
    viewerId
      ? ReactionModel.find({
          user: new Types.ObjectId(viewerId),
          targetType,
          targetId: { $in: objectIds },
        }).lean()
      : Promise.resolve([]),
  ]);

  for (const group of groups) {
    if (!REACTION_TYPES.includes(group._id.type)) continue;
    const summary = summaries.get(String(group._id.targetId));
    if (!summary) continue;
    summary.counts[group._id.type] = group.count;
    summary.total += group.count;
  }

  for (const reaction of viewerReactions) {
    const summary = summaries.get(String(reaction.targetId));
    if (summary) summary.viewerReaction = reaction.type as ReactionType;
  }

  return summaries;
}

export async function reactionSummary(
  targetType: ReactionTargetType,
  targetId: string,
  viewerId?: string,
): Promise<ReactionSummary> {
  const summaries = await reactionSummaries(targetType, [targetId], viewerId);
  return summaries.get(targetId) ?? { total: 0, counts: emptyCounts(), viewerReaction: null };
}

export async function setReaction(
  userId: string,
  targetType: ReactionTargetType,
  targetId: string,
  type: ReactionType,
): Promise<ReactionSummary> {
  await assertTargetExists(targetType, targetId);

  await ReactionModel.findOneAndUpdate(
    {
      user: new Types.ObjectId(userId),
      targetType,
      targetId: new Types.ObjectId(targetId),
    },
    { $set: { type } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return reactionSummary(targetType, targetId, userId);
}

export async function removeReaction(
  userId: string,
  targetType: ReactionTargetType,
  targetId: string,
): Promise<ReactionSummary> {
  await ReactionModel.deleteOne({
    user: new Types.ObjectId(userId),
    targetType,
    targetId: new Types.ObjectId(targetId),
  });
  return reactionSummary(targetType, targetId, userId);
}
