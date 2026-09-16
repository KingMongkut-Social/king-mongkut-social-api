import { Schema, model } from 'mongoose';

export type Role = 'user' | 'admin';
export type University = 'KMITL' | 'KMUTNB' | 'KMUTT';

export interface User {
  name: string;
  email: string;
  passwordHash: string;
  university: University;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema(
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
      required: true,
      select: false,
    },
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
      transform(_doc, ret: any) {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

export const UserModel = model('User', userSchema);