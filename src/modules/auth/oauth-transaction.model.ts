import { Schema, model } from 'mongoose';

const oauthTransactionSchema = new Schema({
  stateHash: { type: String, required: true, unique: true },
  bindingHash: { type: String, required: true },
  nonce: { type: String, required: true },
  codeVerifier: { type: String, required: true },
  returnTo: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, collection: 'oauth_transactions' });

oauthTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthTransactionModel = model('OAuthTransaction', oauthTransactionSchema);
