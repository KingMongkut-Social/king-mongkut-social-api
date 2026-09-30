import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { type Response as TestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/modules/auth/token.service.js';
import { FriendshipModel } from '../src/modules/friends/friendship.model.js';
import { PostBookmarkModel } from '../src/modules/posts/post-bookmark.model.js';
import { PostCommentModel } from '../src/modules/posts/post-comment.model.js';
import { PostLikeModel } from '../src/modules/posts/post-like.model.js';
import { PostModel } from '../src/modules/posts/post.model.js';
import { UserModel } from '../src/modules/users/user.model.js';

const app = createApp();
let database: MongoMemoryServer;

type Profile = {
  id: string;
  name: string;
  friendCount: number;
  mutualFriendCount: number;
  relationshipStatus: string;
  requestId: string | null;
};
type Page<T> = { items: T[]; page: number; limit: number; total: number; pages: number };
type Post = { _id: string; content: string; status: string; likeCount: number; likedByMe: boolean; savedByMe: boolean };

function data<T>(response: TestResponse): T {
  const body: unknown = response.body;
  if (!body || typeof body !== 'object' || !('data' in body)) throw new Error('Missing data envelope');
  return body.data as T;
}

async function member(name: string) {
  const user = await UserModel.create({
    name,
    email: `${name.toLowerCase()}@kmitl.ac.th`,
    googleSub: `google-${name.toLowerCase()}`,
    university: 'KMITL',
    faculty: 'Engineering',
    department: 'Computer',
    emailVerified: true,
  });
  return { user, token: await signAccessToken(user.id, user.role) };
}

async function friendship(firstId: string, secondId: string, status: 'accepted' | 'pending' | 'rejected' = 'accepted') {
  return FriendshipModel.create({
    requester: firstId,
    recipient: secondId,
    pairKey: [firstId, secondId].sort().join(':'),
    status,
  });
}

beforeAll(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  await Promise.all([
    UserModel.syncIndexes(), FriendshipModel.syncIndexes(), PostModel.syncIndexes(),
    PostLikeModel.syncIndexes(), PostBookmarkModel.syncIndexes(), PostCommentModel.syncIndexes(),
  ]);
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}), FriendshipModel.deleteMany({}), PostModel.deleteMany({}),
    PostLikeModel.deleteMany({}), PostBookmarkModel.deleteMany({}), PostCommentModel.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

describe('public profiles', () => {
  it('shows safe profile fields, active friend counts, mutual friends, and relationship state', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const carol = await member('Carol');
    const dan = await member('Dan');
    const hidden = await member('Hidden');
    hidden.user.isActive = false;
    await hidden.user.save();

    await friendship(alice.user.id, carol.user.id);
    await friendship(bob.user.id, carol.user.id);
    await friendship(alice.user.id, hidden.user.id);
    await friendship(bob.user.id, dan.user.id);
    const requestFriendship = await friendship(alice.user.id, bob.user.id, 'pending');

    const anonymous = data<{ profile: Profile }>(await request(app)
      .get(`/api/v1/users/${alice.user.id}/profile`).expect(200)).profile;
    expect(anonymous).toMatchObject({ id: alice.user.id, name: 'Alice', friendCount: 1, mutualFriendCount: 0, relationshipStatus: 'none', requestId: null });
    expect(anonymous).not.toHaveProperty('email');
    expect(anonymous).not.toHaveProperty('googleSub');
    expect(anonymous).not.toHaveProperty('passwordHash');

    const viewer = data<{ profile: Profile }>(await request(app)
      .get(`/api/v1/users/${alice.user.id}/profile`).auth(bob.token, { type: 'bearer' }).expect(200)).profile;
    expect(viewer).toMatchObject({ friendCount: 1, mutualFriendCount: 1, relationshipStatus: 'pending_received', requestId: requestFriendship.id });
    const self = data<{ profile: Profile }>(await request(app)
      .get(`/api/v1/users/${alice.user.id.toUpperCase()}/profile`).auth(alice.token, { type: 'bearer' }).expect(200)).profile;
    expect(self).toMatchObject({ relationshipStatus: 'self', mutualFriendCount: 0, requestId: null });

    await FriendshipModel.findByIdAndUpdate(requestFriendship.id, { status: 'accepted' });
    const accepted = data<{ profile: Profile }>(await request(app)
      .get(`/api/v1/users/${alice.user.id}/profile`).auth(bob.token, { type: 'bearer' }).expect(200)).profile;
    expect(accepted).toMatchObject({ friendCount: 2, mutualFriendCount: 1, relationshipStatus: 'friends', requestId: requestFriendship.id });

    await request(app).get(`/api/v1/users/${hidden.user.id}/profile`).expect(404);
    await request(app).get(`/api/v1/users/${alice.user.id}/profile`).auth('invalid', { type: 'bearer' }).expect(401);
  });

  it('lists only the selected active user’s published posts with viewer reactions and stable pagination', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const first = await PostModel.create({ user: alice.user.id, title: 'One', content: 'One', status: 'published', publishedAt: new Date('2026-01-01') });
    const second = await PostModel.create({ user: alice.user.id, title: 'Two', content: 'Two', status: 'published', publishedAt: new Date('2026-01-02') });
    await PostModel.create({ user: alice.user.id, title: 'Draft', content: 'Secret', status: 'draft' });
    await PostModel.create({ user: bob.user.id, title: 'Other', content: 'Other', status: 'published', publishedAt: new Date('2026-01-03') });
    await PostLikeModel.create({ post: second.id, user: bob.user.id });
    await PostBookmarkModel.create({ post: second.id, user: bob.user.id });

    const page = data<Page<Post>>(await request(app).get(`/api/v1/users/${alice.user.id}/posts`)
      .query({ page: 1, limit: 1 }).auth(bob.token, { type: 'bearer' }).expect(200));
    expect(page).toMatchObject({ total: 2, page: 1, limit: 1, pages: 2 });
    expect(page.items).toEqual([expect.objectContaining({ _id: second.id, likeCount: 1, likedByMe: true, savedByMe: true })]);
    const next = data<Page<Post>>(await request(app).get(`/api/v1/users/${alice.user.id}/posts`)
      .query({ page: 2, limit: 1 }).expect(200));
    expect(next.items).toEqual([expect.objectContaining({ _id: first.id, likedByMe: false })]);
    expect(data<Page<Post>>(await request(app).get(`/api/v1/users/${alice.user.id}/posts`)
      .query({ search: 'Secret' }).expect(200)).total).toBe(0);

    expect(data<Page<Post>>(await request(app).get(`/api/v1/users/${alice.user.id}/posts`)
      .query({ status: 'draft' }).auth(alice.token, { type: 'bearer' }).expect(200)).total).toBe(2);
  });

  it('paginates published photo posts independently from the main post feed', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    await PostModel.create({ user: alice.user.id, title: 'Text', content: 'No image', status: 'published' });
    const image = await PostModel.create({
      user: alice.user.id, title: 'Image', content: 'Image', status: 'published',
      images: ['https://example.org/image.png'], publishedAt: new Date('2026-01-01'),
    });
    const cover = await PostModel.create({
      user: alice.user.id, title: 'Cover', content: 'Cover', status: 'published',
      coverImage: 'https://example.org/cover.png', publishedAt: new Date('2026-01-02'),
    });
    const attachment = await PostModel.create({
      user: alice.user.id, title: 'Attachment', content: 'Attachment', status: 'published',
      attachments: [{ url: 'https://example.org/attach.png', name: 'attach.png', mimeType: 'image/png', size: 100 }],
      publishedAt: new Date('2026-01-03'),
    });
    await PostModel.create({
      user: alice.user.id, title: 'Private photo', content: 'Private photo', status: 'draft',
      images: ['https://example.org/private.png'],
    });
    await PostModel.create({
      user: bob.user.id, title: 'Other photo', content: 'Other photo', status: 'published',
      images: ['https://example.org/other.png'],
    });

    const first = data<Page<Post>>(await request(app).get(`/api/v1/users/${alice.user.id}/posts`)
      .query({ imagesOnly: 1, limit: 2 }).expect(200));
    expect(first).toMatchObject({ total: 3, page: 1, pages: 2 });
    expect(first.items.map((post) => post._id)).toEqual([attachment.id, cover.id]);
    const next = data<Page<Post>>(await request(app).get(`/api/v1/users/${alice.user.id}/posts`)
      .query({ imagesOnly: 1, page: 2, limit: 2 }).expect(200));
    expect(next.items.map((post) => post._id)).toEqual([image.id]);
    const searched = data<Page<Post>>(await request(app).get(`/api/v1/users/${alice.user.id}/posts`)
      .query({ imagesOnly: 1, search: 'Cover' }).expect(200));
    expect(searched.items.map((post) => post._id)).toEqual([cover.id]);
    await request(app).get(`/api/v1/users/${alice.user.id}/posts`).query({ imagesOnly: 'false' }).expect(422);
  });

  it('paginates accepted active friends without exposing private fields or inactive profiles', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const carol = await member('Carol');
    const dan = await member('Dan');
    dan.user.isActive = false;
    await dan.user.save();
    await friendship(alice.user.id, bob.user.id);
    await friendship(alice.user.id, carol.user.id);
    await friendship(alice.user.id, dan.user.id);
    const page = data<Page<{ id: string; name: string }>>(await request(app)
      .get(`/api/v1/users/${alice.user.id}/friends`).query({ page: 2, limit: 1 }).expect(200));
    expect(page).toMatchObject({ total: 2, page: 2, limit: 1, pages: 2 });
    expect(page.items).toEqual([expect.objectContaining({ id: carol.user.id, name: 'Carol' })]);
    expect(page.items[0]).not.toHaveProperty('email');
    expect(page.items[0]).not.toHaveProperty('friendshipId');
    await request(app).get(`/api/v1/users/${dan.user.id}/friends`).expect(404);
    await request(app).get('/api/v1/users/not-an-id/profile').expect(422);
    await request(app).get(`/api/v1/users/${alice.user.id}/friends`).query({ limit: 101 }).expect(422);
  });
});
