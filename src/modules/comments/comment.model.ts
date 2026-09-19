import { Schema, model, type Types } from 'mongoose';

export interface Comment {
  post: Types.ObjectId;
  user: Types.ObjectId;
  parentComment: Types.ObjectId | null;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<Comment>(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentComment: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000 },
    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'comments',
  },
);

commentSchema.index({ post: 1, createdAt: 1 });
commentSchema.index({ post: 1, parentComment: 1, createdAt: 1 });

export const CommentModel = model<Comment>('Comment', commentSchema);
