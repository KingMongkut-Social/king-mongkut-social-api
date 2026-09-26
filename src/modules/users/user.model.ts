import { Schema, model } from 'mongoose';

export type Role = 'user' | 'admin';
export type University = 'KMITL' | 'KMUTNB' | 'KMUTT';

export interface User {
  name: string;
  email: string;
  passwordHash?: string;
  googleSub?: string;
  faculty?: string;
  department?: string;
  university: University;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    googleSub: { type: String, select: false },
    faculty: { type: String, trim: true, maxlength: 150 },
    department: { type: String, trim: true, maxlength: 150 },
    university: {
      type: String,
      enum: ['KMITL', 'KMUTNB', 'KMUTT'],
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'users',
    toJSON: {
      transform(_doc, ret) {
        const output: Record<string, unknown> = { ...ret };
        delete output.passwordHash;
        delete output.googleSub;
        output.needsProfileCompletion = !hasCompleteProfile(ret);
        return output;
      },
    },
  },
);

userSchema.index({ googleSub: 1 }, { unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } });

export function hasCompleteProfile(user: { faculty?: string | null; department?: string | null }): boolean {
  return Boolean(user.faculty?.trim() && user.department?.trim());
}

export const UserModel = model('User', userSchema);
