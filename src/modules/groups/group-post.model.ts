import { Schema, model, type Types } from 'mongoose';

export interface GroupPost {
  group: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<GroupPost>({
  group: { type: Schema.Types.ObjectId, ref: 'CommunityGroup', required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 20000 },
}, { timestamps: true, versionKey: false, collection: 'community_group_posts' });

schema.index({ group: 1, createdAt: -1 });

export const GroupPostModel = model<GroupPost>('GroupPost', schema);
