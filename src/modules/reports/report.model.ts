import { Schema, model, type Types } from 'mongoose';

export type ReportTarget = 'post' | 'comment' | 'user' | 'group';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'fake_account' | 'scam' | 'other';

export interface Report {
  reporter: Types.ObjectId;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details: string;
  status: 'pending' | 'resolved' | 'dismissed';
  action?: string | null;
  note?: string | null;
  moderatedBy?: Types.ObjectId | null;
  moderatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<Report>({
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['post', 'comment', 'user', 'group'], required: true },
  targetId: { type: String, required: true, trim: true },
  reason: {
    type: String,
    enum: ['spam', 'harassment', 'inappropriate', 'fake_account', 'scam', 'other'],
    required: true,
  },
  details: { type: String, trim: true, maxlength: 2000, default: '' },
  status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending', required: true },
  action: { type: String, default: null },
  note: { type: String, maxlength: 2000, default: null },
  moderatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  moderatedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false, collection: 'reports' });

schema.index({ status: 1, createdAt: -1 });
schema.index({ targetType: 1, targetId: 1 });

export const ReportModel = model<Report>('Report', schema);
