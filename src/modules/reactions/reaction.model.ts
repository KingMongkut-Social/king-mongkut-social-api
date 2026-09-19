import { Schema, model, type Types } from 'mongoose';

export const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const;
export type ReactionType = typeof REACTION_TYPES[number];
export type ReactionTargetType = 'post' | 'comment';

export interface Reaction {
  user: Types.ObjectId;
  targetType: ReactionTargetType;
  targetId: Types.ObjectId;
  type: ReactionType;
  createdAt: Date;
  updatedAt: Date;
}

const reactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: ['post', 'comment'], required: true, index: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: REACTION_TYPES, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'reactions',
  },
);

reactionSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });
reactionSchema.index({ targetType: 1, targetId: 1, type: 1 });

export const ReactionModel = model('Reaction', reactionSchema);
