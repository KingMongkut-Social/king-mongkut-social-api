import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { CommunityGroupModel } from '../groups/group.model.js';
import { GroupMemberModel } from '../groups/group-member.model.js';
import { GroupPostModel } from '../groups/group-post.model.js';
import { PostCommentModel } from '../posts/post-comment.model.js';
import { PostModel } from '../posts/post.model.js';
import * as postService from '../posts/post.service.js';
import { UserModel } from '../users/user.model.js';
import { ReportModel, type ReportReason, type ReportStatus, type ReportTarget } from './report.model.js';

async function validateTarget(reporterId: string, targetType: ReportTarget, targetId: string) {
  if (targetType === 'user') {
    if (targetId === reporterId) throw new AppError(400, 'BAD_REQUEST', 'Cannot report yourself');
    if (!await UserModel.exists({ _id: targetId, isActive: true })) {
      throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
    }
    return;
  }

  if (targetType === 'post') {
    if (!await PostModel.exists({ _id: targetId, status: 'published' })) {
      throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
    }
    return;
  }

  if (targetType === 'comment') {
    const comment = await PostCommentModel.findById(targetId).select('post').lean();
    if (!comment || !await PostModel.exists({ _id: comment.post, status: 'published' })) {
      throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
    }
    return;
  }

  if (targetType === 'group') {
    const group = await CommunityGroupModel.findById(targetId).select('privacy').lean();
    if (!group) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
    if (group.privacy === 'private' && !await GroupMemberModel.exists({ group: targetId, user: reporterId })) {
      throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
    }
    return;
  }

  const groupPost = await GroupPostModel.findById(targetId).select('group').lean();
  if (!groupPost) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
  const group = await CommunityGroupModel.findById(groupPost.group).select('privacy').lean();
  if (!group) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
  if (group.privacy === 'private' && !await GroupMemberModel.exists({ group: group._id, user: reporterId })) {
    throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
  }
}

export async function createReport(
  reporterId: string,
  input: {
    targetType: ReportTarget;
    targetId: string;
    reason: ReportReason;
    details: string;
  },
) {
  await validateTarget(reporterId, input.targetType, input.targetId);
  if (await ReportModel.exists({
    reporter: reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    status: 'pending',
  })) {
    throw new AppError(409, 'REPORT_ALREADY_PENDING', 'You already have a pending report for this target');
  }
  return ReportModel.create({ ...input, reporter: reporterId });
}

export async function listReports(status: ReportStatus, page: number, limit: number) {
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

  if (action === 'restore_user') {
    if (report.targetType !== 'user' || report.status !== 'resolved' || report.action !== 'suspend_user') {
      throw new AppError(409, 'REPORT_RESTORE_NOT_AVAILABLE', 'This report cannot restore a user');
    }
    if (report.targetId === moderatorId) {
      throw new AppError(400, 'BAD_REQUEST', 'Cannot restore your own account through moderation');
    }
    const result = await UserModel.updateOne({ _id: report.targetId }, { $set: { isActive: true } });
    if (!result.matchedCount) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
    report.action = 'restore_user';
    report.note = note ?? null;
    report.moderatedBy = new Types.ObjectId(moderatorId);
    report.moderatedAt = new Date();
    await report.save();
    return report;
  }

  if (report.status !== 'pending') {
    throw new AppError(409, 'REPORT_HANDLED', 'Report has already been handled');
  }

  if (action === 'remove_content') {
    if (report.targetType === 'post') {
      await postService.deletePost(report.targetId, moderatorId, 'admin');
    } else if (report.targetType === 'comment') {
      const comment = await PostCommentModel.findById(report.targetId).select('post').lean();
      if (!comment) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
      await postService.deleteComment(String(comment.post), report.targetId, moderatorId, 'admin');
    } else if (report.targetType === 'group_post') {
      const result = await GroupPostModel.deleteOne({ _id: report.targetId });
      if (!result.deletedCount) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
    } else if (report.targetType === 'group') {
      if (!await CommunityGroupModel.exists({ _id: report.targetId })) {
        throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
      }
      await Promise.all([
        CommunityGroupModel.deleteOne({ _id: report.targetId }),
        GroupMemberModel.deleteMany({ group: report.targetId }),
        GroupPostModel.deleteMany({ group: report.targetId }),
      ]);
    } else {
      throw new AppError(422, 'INVALID_MODERATION_ACTION', 'Cannot remove this target as content');
    }
  } else if (action === 'suspend_user') {
    if (report.targetType !== 'user') {
      throw new AppError(422, 'INVALID_MODERATION_ACTION', 'This action requires a user report');
    }
    if (report.targetId === moderatorId) throw new AppError(400, 'BAD_REQUEST', 'Cannot suspend yourself');
    const result = await UserModel.updateOne({ _id: report.targetId }, { $set: { isActive: false } });
    if (!result.matchedCount) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Report target not found');
  }

  report.status = action === 'dismiss' ? 'dismissed' : 'resolved';
  report.action = action;
  report.note = note ?? null;
  report.moderatedBy = new Types.ObjectId(moderatorId);
  report.moderatedAt = new Date();
  await report.save();
  return report;
}
