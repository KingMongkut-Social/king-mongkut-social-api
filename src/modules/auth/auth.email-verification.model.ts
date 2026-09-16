import { Schema, model, type Types } from 'mongoose';

export interface EmailVerification {
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const emailVerificationSchema = new Schema(
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
    usedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'email_verifications',
  },
);

emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationModel = model(
  'EmailVerification',
  emailVerificationSchema,
);