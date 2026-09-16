import { Schema, model, type Types } from 'mongoose';

export type PostStatus = 'draft' | 'published';

export interface Post {
  user: Types.ObjectId;
  title: string;
  content: string;
  status: PostStatus;
  coverImage?: string | null;
  tags?: string[];
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 150,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 20_000,
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      required: true,
      index: true,
    },
    coverImage: {
      type: String,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: -1,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'posts',
  },
);

export const PostModel = model('Post', postSchema);