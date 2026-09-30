import { Schema, model, type Types } from 'mongoose';

export interface ChatMessage {
  chat: Types.ObjectId;
  sender: Types.ObjectId;
  content: string;
  createdAt: Date;
}

const chatMessageSchema = new Schema<ChatMessage>({
  chat: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, maxlength: 4000 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'chat_messages' });

chatMessageSchema.index({ chat: 1, createdAt: -1, _id: -1 });

export const ChatMessageModel = model<ChatMessage>('ChatMessage', chatMessageSchema);
