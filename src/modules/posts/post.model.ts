import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export type PostStatus = 'draft' | 'published';

export interface Post {
  title: string;
  content: string;
  status: PostStatus;
  author: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type PostDocument = HydratedDocument<Post>;

const postSchema = new Schema<Post>(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 20_000 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });

export const PostModel = model<Post>('Post', postSchema);
