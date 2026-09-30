import { Schema, model, type Types } from 'mongoose';

export type PostReaction = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY';

export interface PostLike {
  post: Types.ObjectId;
  user: Types.ObjectId;
  reaction: PostReaction;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PostLike>({
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reaction: {
    type: String,
    enum: ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'],
    default: 'LIKE',
    required: true,
  },
}, { timestamps: true, versionKey: false, collection: 'post_likes' });

schema.index({ post: 1, user: 1 }, { unique: true });
schema.index({ user: 1, createdAt: -1 });
schema.index({ post: 1, reaction: 1 });

export const PostLikeModel = model<PostLike>('PostLike', schema);
