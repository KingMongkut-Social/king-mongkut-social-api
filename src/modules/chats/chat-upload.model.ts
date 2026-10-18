import { Schema, model } from 'mongoose';

const chatUploadSchema = new Schema({
  url: { type: String, required: true, unique: true },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'chat_uploads' });

export const ChatUploadModel = model('ChatUpload', chatUploadSchema);
