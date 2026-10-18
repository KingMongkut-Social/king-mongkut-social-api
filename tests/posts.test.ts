import { rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { type Response as TestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { signAccessToken } from '../src/modules/auth/token.service.js';
import { FriendshipModel } from '../src/modules/friends/friendship.model.js';
import { PostBookmarkModel } from '../src/modules/posts/post-bookmark.model.js';
import { PostCommentModel } from '../src/modules/posts/post-comment.model.js';
import { PostLikeModel } from '../src/modules/posts/post-like.model.js';
import { PostModel } from '../src/modules/posts/post.model.js';
import { UserModel } from '../src/modules/users/user.model.js';

const app = createApp();
let database: MongoMemoryServer;

type PostResponse = {
  _id: string;
  title: string;
  content: string;
  status: string;
  author: { _id: string; name: string };
  images: string[];
  feeling: string | null;
  taggedFriends: string[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
};
type ListResponse<T> = { items: T[]; total: number; page: number; limit: number; pages: number };
type CommentResponse = { _id: string; author: { _id: string; name: string }; content: string; parentId: string | null };

function data<T>(response: TestResponse): T {
  const body: unknown = response.body;
  if (!body || typeof body !== 'object' || !('data' in body)) throw new Error('Missing data envelope');
  return body.data as T;
}

async function member(name: string, complete = true) {
  const user = await UserModel.create({
    name,
    email: `${name.toLowerCase()}@kmitl.ac.th`,
    googleSub: `google-${name.toLowerCase()}`,
    university: 'KMITL',
    emailVerified: true,
    ...(complete ? { faculty: 'Engineering', department: 'Computer' } : {}),
  });
  return { user, token: await signAccessToken(user.id, user.role) };
}

beforeAll(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  await Promise.all([
    UserModel.syncIndexes(), PostModel.syncIndexes(), PostLikeModel.syncIndexes(),
    PostBookmarkModel.syncIndexes(), PostCommentModel.syncIndexes(), FriendshipModel.syncIndexes(),
  ]);
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    PostModel.deleteMany({}), PostLikeModel.deleteMany({}), PostBookmarkModel.deleteMany({}),
    PostCommentModel.deleteMany({}), UserModel.deleteMany({}),
    FriendshipModel.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
  const uploadPath = resolve(env.UPLOAD_DIR);
  if (dirname(uploadPath) === resolve(tmpdir()) && basename(uploadPath).startsWith('king-mongkut-social-posts-test-')) {
    await rm(uploadPath, { recursive: true, force: true });
  }
});

describe('social posts', () => {
  it('creates text and image-only posts, lists public posts, and protects drafts', async () => {
    const alice = await member('Alice');
    const incomplete = await member('Incomplete', false);
    await request(app).post('/api/v1/posts').send({ content: 'Hello' }).expect(401);
    await request(app).post('/api/v1/posts').auth(incomplete.token, { type: 'bearer' })
      .send({ content: 'Hello' }).expect(403);
    await request(app).post('/api/v1/posts').auth(alice.token, { type: 'bearer' })
      .send({ title: 'Empty' }).expect(422);

    const created = await request(app).post('/api/v1/posts').auth(alice.token, { type: 'bearer' })
      .send({ content: 'สวัสดีเพื่อน ๆ', feeling: 'มีความสุข' }).expect(201);
    const post = data<{ post: PostResponse }>(created).post;
    expect(post).toMatchObject({ title: 'สวัสดีเพื่อน ๆ', status: 'published', feeling: 'มีความสุข' });
    expect(post.author).toMatchObject({ _id: alice.user.id, name: 'Alice' });

    const imageOnly = await request(app).post('/api/v1/posts').auth(alice.token, { type: 'bearer' })
      .send({ content: '', images: ['https://example.org/a.png'], taggedFriends: [] }).expect(201);
    expect(data<{ post: PostResponse }>(imageOnly).post).toMatchObject({ title: 'รูปภาพ', content: '', images: ['https://example.org/a.png'] });

    const draft = await request(app).post('/api/v1/posts').auth(alice.token, { type: 'bearer' })
      .send({ content: 'private', status: 'draft' }).expect(201);
    const draftId = data<{ post: PostResponse }>(draft).post._id;
    await request(app).get(`/api/v1/posts/${draftId}`).expect(404);
    await request(app).get(`/api/v1/posts/${draftId}`).auth(alice.token, { type: 'bearer' }).expect(200);
    const list = await request(app).get('/api/v1/posts').expect(200);
    expect(data<ListResponse<PostResponse>>(list).total).toBe(2);
    const mine = await request(app).get('/api/v1/posts/mine').auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<ListResponse<PostResponse>>(mine).total).toBe(3);
  });

  it('keeps likes and bookmarks idempotent and scoped to each viewer', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const post = data<{ post: PostResponse }>(await request(app).post('/api/v1/posts')
      .auth(alice.token, { type: 'bearer' }).send({ content: 'Public post' }).expect(201)).post;
    await request(app).put(`/api/v1/posts/${post._id}/like`).expect(401);
    await request(app).put(`/api/v1/posts/${post._id}/like`).auth(bob.token, { type: 'bearer' }).expect(200);
    const likedAgain = await request(app).put(`/api/v1/posts/${post._id}/like`).auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<{ post: PostResponse }>(likedAgain).post).toMatchObject({ likeCount: 1, likedByMe: true });
    await request(app).put(`/api/v1/posts/${post._id}/bookmark`).auth(bob.token, { type: 'bearer' }).expect(200);
    const savedAgain = await request(app).put(`/api/v1/posts/${post._id}/bookmark`).auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<{ post: PostResponse }>(savedAgain).post).toMatchObject({ savedByMe: true, likeCount: 1 });

    const publicList = await request(app).get('/api/v1/posts').expect(200);
    expect(data<ListResponse<PostResponse>>(publicList).items[0]).toMatchObject({ likeCount: 1, likedByMe: false, savedByMe: false });
    const bobList = await request(app).get('/api/v1/posts').auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<ListResponse<PostResponse>>(bobList).items[0]).toMatchObject({ likeCount: 1, likedByMe: true, savedByMe: true });
    const bookmarks = await request(app).get('/api/v1/posts/bookmarks').auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<ListResponse<PostResponse>>(bookmarks)).toMatchObject({ total: 1, items: [{ _id: post._id, savedByMe: true }] });

    await request(app).delete(`/api/v1/posts/${post._id}/like`).auth(bob.token, { type: 'bearer' }).expect(200);
    const unlikedAgain = await request(app).delete(`/api/v1/posts/${post._id}/like`).auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<{ post: PostResponse }>(unlikedAgain).post).toMatchObject({ likeCount: 0, likedByMe: false });
    await request(app).delete(`/api/v1/posts/${post._id}/bookmark`).auth(bob.token, { type: 'bearer' }).expect(200);
    const empty = await request(app).get('/api/v1/posts/bookmarks').auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<ListResponse<PostResponse>>(empty).total).toBe(0);
  });

  it('only tags active accepted friends and normalizes reply depth', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const eve = await member('Eve');
    await request(app).post('/api/v1/posts').auth(alice.token, { type: 'bearer' })
      .send({ content: 'invalid tag', taggedFriends: [eve.user.id] }).expect(422);
    await FriendshipModel.create({ requester: alice.user._id, recipient: bob.user._id, status: 'accepted', pairKey: [alice.user.id, bob.user.id].sort().join(':') });
    const created = await request(app).post('/api/v1/posts').auth(alice.token, { type: 'bearer' })
      .send({ content: 'with friend', taggedFriends: [bob.user.id] }).expect(201);
    const post = data<{ post: PostResponse }>(created).post;
    expect(post.taggedFriends).toEqual([bob.user.id]);
    const root = data<{ comment: CommentResponse }>(await request(app).post(`/api/v1/posts/${post._id}/comments`)
      .auth(bob.token, { type: 'bearer' }).send({ content: 'Root' }).expect(201)).comment;
    const reply = data<{ comment: CommentResponse }>(await request(app).post(`/api/v1/posts/${post._id}/comments`)
      .auth(alice.token, { type: 'bearer' }).send({ content: 'Reply', parentId: root._id }).expect(201)).comment;
    const nested = data<{ comment: CommentResponse }>(await request(app).post(`/api/v1/posts/${post._id}/comments`)
      .auth(bob.token, { type: 'bearer' }).send({ content: 'Reply to reply', parentId: reply._id }).expect(201)).comment;
    expect(nested.parentId).toBe(root._id);
  });

  it('lists comments with populated authors and enforces deletion permissions', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const eve = await member('Eve');
    const post = data<{ post: PostResponse }>(await request(app).post('/api/v1/posts')
      .auth(alice.token, { type: 'bearer' }).send({ content: 'Comment here' }).expect(201)).post;
    const first = await request(app).post(`/api/v1/posts/${post._id}/comments`)
      .auth(bob.token, { type: 'bearer' }).send({ content: ' Nice post ' }).expect(201);
    const comment = data<{ comment: CommentResponse }>(first).comment;
    expect(comment).toMatchObject({ content: 'Nice post', author: { _id: bob.user.id, name: 'Bob' }, parentId: null });
    await request(app).post(`/api/v1/posts/${post._id}/comments`)
      .auth(alice.token, { type: 'bearer' }).send({ content: 'Thanks!', parentId: comment._id }).expect(201);
    const comments = await request(app).get(`/api/v1/posts/${post._id}/comments`).expect(200);
    expect(data<ListResponse<CommentResponse>>(comments).total).toBe(2);
    expect(data<ListResponse<CommentResponse>>(comments).items[1]?.parentId).toBe(comment._id);
    await request(app).delete(`/api/v1/posts/${post._id}/comments/${comment._id}`)
      .auth(eve.token, { type: 'bearer' }).expect(403);
    await request(app).delete(`/api/v1/posts/${post._id}/comments/${comment._id}`)
      .auth(alice.token, { type: 'bearer' }).expect(204);
    expect(data<ListResponse<CommentResponse>>(await request(app).get(`/api/v1/posts/${post._id}/comments`).expect(200)).total).toBe(1);
    const updated = await request(app).get(`/api/v1/posts/${post._id}`).expect(200);
    expect(data<{ post: PostResponse }>(updated).post.commentCount).toBe(1);
  });

  it('keeps a shared upload until the last referencing post is deleted', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const uploaded = await request(app).post('/api/v1/posts/uploads').auth(alice.token, { type: 'bearer' })
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { filename: 'shared.png', contentType: 'image/png' }).expect(201);
    const url = data<{ asset: { url: string } }>(uploaded).asset.url;
    const original = data<{ post: PostResponse }>(await request(app).post('/api/v1/posts')
      .auth(alice.token, { type: 'bearer' }).send({ images: [url] }).expect(201)).post;
    const shared = data<{ post: PostResponse }>(await request(app).post('/api/v1/posts')
      .auth(bob.token, { type: 'bearer' }).send({ coverImage: url }).expect(201)).post;
    await request(app).delete(`/api/v1/posts/${shared._id}`).auth(bob.token, { type: 'bearer' }).expect(204);
    await request(app).get(url).expect(200);
    await request(app).delete(`/api/v1/posts/${original._id}`).auth(alice.token, { type: 'bearer' }).expect(204);
    await request(app).get(url).expect(404);
  });

  it('uploads and serves a checked file, rejects spoofed files and unsafe paths', async () => {
    const alice = await member('Alice');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const uploaded = await request(app).post('/api/v1/posts/uploads').auth(alice.token, { type: 'bearer' })
      .attach('file', png, { filename: 'picture.png', contentType: 'image/png' }).expect(201);
    const asset = data<{ asset: { url: string; name: string; mimeType: string; size: number } }>(uploaded).asset;
    expect(asset).toMatchObject({ name: 'picture.png', mimeType: 'image/png', size: png.length });
    expect(asset.url).toMatch(/^\/api\/v1\/posts\/uploads\/[a-f0-9-]+\.png$/);
    const served = await request(app).get(asset.url).expect(200);
    expect(served.headers['content-type']).toMatch(/^image\/png/);
    expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');
    await request(app).post('/api/v1/posts/uploads').auth(alice.token, { type: 'bearer' })
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' }).expect(415);
    await request(app).post('/api/v1/posts/uploads').auth(alice.token, { type: 'bearer' })
      .attach('file', Buffer.from('<svg></svg>'), { filename: 'evil.svg', contentType: 'image/svg+xml' }).expect(415);
    await request(app).post('/api/v1/posts/uploads').auth(alice.token, { type: 'bearer' })
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 1), { filename: 'too-large.png', contentType: 'image/png' }).expect(413);
    await request(app).get('/api/v1/posts/uploads/not-a-file.png').expect(404);
    const uploadEntries = await readdir(env.UPLOAD_DIR, { withFileTypes: true });
    expect(uploadEntries.filter((entry) => entry.isFile())).toHaveLength(1);
  });
});
