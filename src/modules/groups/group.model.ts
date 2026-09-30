import { Schema, model, type Types } from 'mongoose';

export interface CommunityGroup {
  name: string;
  description: string;
  coverUrl?: string | null;
  privacy: 'public' | 'private';
  university?: 'KMITL' | 'KMUTT' | 'KMUTNB' | null;
  creator: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<CommunityGroup>({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  coverUrl: { type: String, default: null },
  privacy: { type: String, enum: ['public', 'private'], default: 'public', required: true },
  university: { type: String, enum: ['KMITL', 'KMUTT', 'KMUTNB'], default: null },
  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false, collection: 'community_groups' });

schema.index({ name: 'text', description: 'text' });
schema.index({ university: 1, createdAt: -1 });

export const CommunityGroupModel = model<CommunityGroup>('CommunityGroup', schema);
