import { Schema, model, type Types } from 'mongoose';

export type NotificationType =
  | 'friend_request' | 'friend_accept'
  | 'post_reaction' | 'post_comment' | 'comment_reply'
  | 'group_invite' | 'group_join';

export interface Notification {
  recipient: Types.ObjectId;
  actor: Types.ObjectId;
  type: NotificationType;
  entityId?: string | null;
  content?: string | null;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<Notification>({
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['friend_request', 'friend_accept', 'post_reaction', 'post_comment', 'comment_reply', 'group_invite', 'group_join'],
    required: true,
  },
  entityId: { type: String, default: null },
  content: { type: String, maxlength: 500, default: null },
  readAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false, collection: 'notifications' });

schema.index({ recipient: 1, createdAt: -1 });
schema.index({ recipient: 1, readAt: 1 });

export const NotificationModel = model<Notification>('Notification', schema);
