import { Schema, model, type Types } from 'mongoose';

export type PostStatus = 'draft' | 'published';

export interface PostAttachment {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface Post {
  user: Types.ObjectId;
  title: string;
  content: string;
  status: PostStatus;
  coverImage?: string | null;
  tags: string[];
  images: string[];
  attachments: PostAttachment[];
  feeling?: string | null;
  taggedFriends: Types.ObjectId[];
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<PostAttachment>({
  url: { type: String, required: true },
  name: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
}, { _id: false });

const postSchema = new Schema<Post>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 150,
      default: '',
    },
    content: {
      type: String,
      trim: true,
      maxlength: 20_000,
      default: '',
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'published',
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
    images: { type: [String], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    feeling: { type: String, default: null },
    taggedFriends: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
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

postSchema.index({ status: 1, publishedAt: -1, createdAt: -1 });
postSchema.index({ user: 1, status: 1, publishedAt: -1, createdAt: -1, _id: -1 });

export const PostModel = model<Post>('Post', postSchema);
