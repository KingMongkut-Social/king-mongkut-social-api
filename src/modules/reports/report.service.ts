import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { CommunityGroupModel } from '../groups/group.model.js';
import { GroupMemberModel } from '../groups/group-member.model.js';
import { GroupPostModel } from '../groups/group-post.model.js';
import { PostCommentModel } from '../posts/post-comment.model.js';
import { PostModel } from '../posts/post.model.js';
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
    if (report.targetType === 'post') await PostModel.deleteOne({ _id: report.targetId });
    else if (report.targetType === 'comment') await PostCommentModel.deleteOne({ _id: report.targetId });
    else if (report.targetType === 'group') {
      await Promise.all([
        CommunityGroupModel.deleteOne({ _id: report.targetId }),
        GroupMemberModel.deleteMany({ group: report.targetId }),
        GroupPostModel.deleteMany({ group: report.targetId }),
      ]);
    }
    else throw new AppError(422, 'INVALID_MODERATION_ACTION', 'Cannot remove this target as content');
  } else if (action === 'suspend_user' || action === 'restore_user') {
    if (report.targetType !== 'user') {
      throw new AppError(422, 'INVALID_MODERATION_ACTION', 'This action requires a user report');
    }
    await UserModel.updateOne(
      { _id: report.targetId },
      { $set: { isActive: action === 'restore_user' } },
    );
  }

  report.status = action === 'dismiss' ? 'dismissed' : 'resolved';
  report.action = action;
  report.note = note ?? null;
  report.moderatedBy = new Types.ObjectId(moderatorId);
  report.moderatedAt = new Date();
  await report.save();
  return report;
}
