import { Schema, model, type Types } from 'mongoose';

export interface Chat {
  type: 'direct' | 'group';
  name: string | null;
  members: Types.ObjectId[];
  directKey?: string;
  lastMessage?: Types.ObjectId;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema<Chat>({
  type: { type: String, enum: ['direct', 'group'], required: true },
  name: { type: String, trim: true, maxlength: 80, default: null },
  members: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  directKey: { type: String },
  lastMessage: { type: Schema.Types.ObjectId, ref: 'ChatMessage' },
  lastMessageAt: { type: Date },
}, { timestamps: true, versionKey: false, collection: 'chats' });

chatSchema.index({ members: 1, updatedAt: -1 });
chatSchema.index({ directKey: 1 }, { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } });

export const ChatModel = model<Chat>('Chat', chatSchema);
