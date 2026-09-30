import { Schema, model, type Types } from 'mongoose';

export type GroupRole = 'owner' | 'admin' | 'moderator' | 'member';
export interface GroupMember {
  group: Types.ObjectId;
  user: Types.ObjectId;
  role: GroupRole;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<GroupMember>({
  group: { type: Schema.Types.ObjectId, ref: 'CommunityGroup', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'admin', 'moderator', 'member'], default: 'member', required: true },
}, { timestamps: true, versionKey: false, collection: 'community_group_members' });

schema.index({ group: 1, user: 1 }, { unique: true });
schema.index({ user: 1, createdAt: -1 });

export const GroupMemberModel = model<GroupMember>('GroupMember', schema);
