import { Schema, model } from 'mongoose';

export type Role = 'user' | 'admin';
export type University = 'KMITL' | 'KMUTNB' | 'KMUTT';

export interface User {
  name: string;
  email: string;
  passwordHash: string | null;
  googleSub?: string;
  avatarUrl: string | null;
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
      required: false,
      default: null,
      select: false,
    },
    googleSub: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    university: {
      type: String,
      enum: ['KMITL', 'KMUTNB', 'KMUTT'],
      required: true,
      index: true,
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
        delete ret.passwordHash;
        delete ret.googleSub;
        return ret;
      },
    },
  },
);

export const UserModel = model<User>('User', userSchema);
