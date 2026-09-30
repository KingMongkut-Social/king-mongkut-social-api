import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { CommunityGroupModel } from '../groups/group.model.js';
import { GroupMemberModel } from '../groups/group-member.model.js';
import { GroupPostModel } from '../groups/group-post.model.js';
import { PostCommentModel } from '../posts/post-comment.model.js';
import { PostModel } from '../posts/post.model.js';
import * as postService from '../posts/post.service.js';
import { UserModel } from '../users/user.model.js';
import { ReportModel, type ReportReason } from './report.model.js';

export async function createReport(
  reporterId: string,
  input: {
    targetType: 'post' | 'comment' | 'user' | 'group';
    targetId: string;
    reason: ReportReason;
    details: string;
  },
) {
  if (input.targetType === 'user' && input.targetId === reporterId) {
    throw new AppError(400, 'BAD_REQUEST', 'Cannot report yourself');
  }

  const targetExists = input.targetType === 'user'
    ? await UserModel.exists({ _id: input.targetId, isActive: true })
    : input.targetType === 'post'
      ? await PostModel.exists({ _id: input.targetId, status: 'published' })
      : input.targetType === 'comment'
        ? await PostCommentModel.exists({ _id: input.targetId })
        : await CommunityGroupModel.exists({ _id: input.targetId });

  if (!targetExists) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
  return ReportModel.create({ ...input, reporter: reporterId });
}

export async function listReports(
  status: 'pending' | 'resolved' | 'dismissed',
  page: number,
  limit: number,
) {
  const [items, total] = await Promise.all([
    ReportModel.find({ status }).sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(limit)
      .populate('reporter', 'name username university')
      .populate('moderatedBy', 'name username').lean(),
    ReportModel.countDocuments({ status }),
  ]);
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

export async function moderate(
  reportId: string,
  moderatorId: string,
  action: 'dismiss' | 'remove_content' | 'suspend_user' | 'restore_user',
  note?: string,
) {
  const report = await ReportModel.findById(reportId);
  if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
  if (report.status !== 'pending') {
    throw new AppError(409, 'REPORT_HANDLED', 'Report has already been handled');
  }

  if (action === 'remove_content') {
    if (report.targetType === 'post') {
      await postService.deletePost(report.targetId, moderatorId, 'admin');
    } else if (report.targetType === 'comment') {
      const comment = await PostCommentModel.findById(report.targetId).select('post').lean();
      if (!comment) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Reported comment no longer exists');
      await postService.deleteComment(String(comment.post), report.targetId, moderatorId, 'admin');
    } else if (report.targetType === 'group') {
      const removed = await CommunityGroupModel.deleteOne({ _id: report.targetId });
      if (!removed.deletedCount) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Reported group no longer exists');
      await Promise.all([
        GroupMemberModel.deleteMany({ group: report.targetId }),
        GroupPostModel.deleteMany({ group: report.targetId }),
      ]);
    } else {
      throw new AppError(422, 'INVALID_MODERATION_ACTION', 'Cannot remove this target as content');
    }
  } else if (action === 'suspend_user' || action === 'restore_user') {
    if (report.targetType !== 'user') {
      throw new AppError(422, 'INVALID_MODERATION_ACTION', 'This action requires a user report');
    }
    const updated = await UserModel.updateOne(
      { _id: report.targetId },
      { $set: { isActive: action === 'restore_user' } },
    );
    if (!updated.matchedCount) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Reported user no longer exists');
  }

  report.status = action === 'dismiss' ? 'dismissed' : 'resolved';
  report.action = action;
  report.note = note ?? null;
  report.moderatedBy = new Types.ObjectId(moderatorId);
  report.moderatedAt = new Date();
  await report.save();
  return report;
}
