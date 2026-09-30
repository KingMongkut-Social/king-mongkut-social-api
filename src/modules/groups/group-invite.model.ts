import { Schema, model, type Types } from 'mongoose';

export type GroupInviteStatus = 'pending' | 'accepted' | 'rejected';

export interface GroupInvite {
  group: Types.ObjectId;
  user: Types.ObjectId;
  invitedBy: Types.ObjectId;
  status: GroupInviteStatus;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<GroupInvite>({
  group: { type: Schema.Types.ObjectId, ref: 'CommunityGroup', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', required: true },
}, { timestamps: true, versionKey: false, collection: 'community_group_invites' });

schema.index({ group: 1, user: 1 }, { unique: true });
schema.index({ user: 1, status: 1, createdAt: -1 });

export const GroupInviteModel = model<GroupInvite>('GroupInvite', schema);
