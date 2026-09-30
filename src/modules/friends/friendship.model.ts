import { Schema, model, type Types } from 'mongoose';

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface Friendship {
  requester: Types.ObjectId;
  recipient: Types.ObjectId;
  pairKey?: string;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
}

const friendshipSchema = new Schema(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    pairKey: { type: String },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'friendships',
  },
);

// ป้องกันการส่งคำขอซ้ำในทิศทางเดียวกัน
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
friendshipSchema.index({ pairKey: 1 }, { unique: true, partialFilterExpression: { pairKey: { $type: 'string' } } });

export const FriendshipModel = model('Friendship', friendshipSchema);
