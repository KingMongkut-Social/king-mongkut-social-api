import { Schema, model, type Types } from 'mongoose';

export interface ChatMessage {
  chat: Types.ObjectId;
  sender: Types.ObjectId;
  content: string;
  imageUrl?: string | null;
  imageName?: string | null;
  imageMimeType?: string | null;
  imageSize?: number | null;
  createdAt: Date;
}

const chatMessageSchema = new Schema<ChatMessage>({
  chat: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, trim: true, maxlength: 4000, default: '' },
  imageUrl: { type: String, trim: true, default: null },
  imageName: { type: String, trim: true, maxlength: 255, default: null },
  imageMimeType: { type: String, trim: true, default: null },
  imageSize: { type: Number, min: 1, max: 10 * 1024 * 1024, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'chat_messages' });

chatMessageSchema.index({ chat: 1, createdAt: -1, _id: -1 });

export const ChatMessageModel = model<ChatMessage>('ChatMessage', chatMessageSchema);
