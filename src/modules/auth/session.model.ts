import { Schema, model, type Types } from 'mongoose';

export interface Session {
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'refresh_sessions',
  },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model('Session', sessionSchema);