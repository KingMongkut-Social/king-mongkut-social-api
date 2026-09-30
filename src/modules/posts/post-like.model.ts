import { Schema, model, type Types } from 'mongoose';

export interface PostLike {
  post: Types.ObjectId;
  user: Types.ObjectId;
  createdAt: Date;
}

const schema = new Schema<PostLike>({
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false, collection: 'post_likes' });

schema.index({ post: 1, user: 1 }, { unique: true });
schema.index({ user: 1, createdAt: -1 });

export const PostLikeModel = model<PostLike>('PostLike', schema);
