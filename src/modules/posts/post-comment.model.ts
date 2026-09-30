import { Schema, model, type Types } from 'mongoose';

export interface PostComment {
  post: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  parentId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PostComment>({
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  parentId: { type: Schema.Types.ObjectId, ref: 'PostComment', default: null },
}, { timestamps: true, versionKey: false, collection: 'post_comments' });

schema.index({ post: 1, createdAt: 1, _id: 1 });

export const PostCommentModel = model<PostComment>('PostComment', schema);
