import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { indexModels } from '../src/scripts/index-models.js';

let database: MongoMemoryServer;

beforeAll(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

describe('production MongoDB index registry', () => {
  it('contains every persisted model used by the application and synchronizes all indexes', async () => {
    expect(indexModels.map((model) => model.modelName).sort()).toEqual([
      'Chat',
      'ChatMessage',
      'CommunityGroup',
      'EmailVerification',
      'Friendship',
      'GroupMember',
      'GroupPost',
      'Notification',
      'OAuthTransaction',
      'Post',
      'PostBookmark',
      'PostComment',
      'PostLike',
      'Report',
      'Session',
      'User',
    ].sort());

    await Promise.all(indexModels.map((model) => model.syncIndexes()));

    const sessionIndexes = await mongoose.connection.collection('sessions').indexes();
    expect(sessionIndexes.some((index) => index.expireAfterSeconds === 0)).toBe(true);

    const membershipIndexes = await mongoose.connection.collection('community_group_members').indexes();
    expect(membershipIndexes.some((index) => index.unique === true && index.key.group === 1 && index.key.user === 1)).toBe(true);

    const reactionIndexes = await mongoose.connection.collection('post_likes').indexes();
    expect(reactionIndexes.some((index) => index.unique === true && index.key.post === 1 && index.key.user === 1)).toBe(true);
  });
});
