import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { type Response as TestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/modules/auth/token.service.js';
import { CommunityGroupModel } from '../src/modules/groups/group.model.js';
import { GroupMemberModel } from '../src/modules/groups/group-member.model.js';
import { GroupPostModel } from '../src/modules/groups/group-post.model.js';
import { NotificationModel } from '../src/modules/notifications/notification.model.js';
import { PostLikeModel } from '../src/modules/posts/post-like.model.js';
import { PostBookmarkModel } from '../src/modules/posts/post-bookmark.model.js';
import { PostCommentModel } from '../src/modules/posts/post-comment.model.js';
import { PostModel } from '../src/modules/posts/post.model.js';
import { ReportModel } from '../src/modules/reports/report.model.js';
import { UserModel } from '../src/modules/users/user.model.js';

const app = createApp();
let database: MongoMemoryServer;

function data<T>(response: TestResponse): T {
  const body: unknown = response.body;
  if (!body || typeof body !== 'object' || !('data' in body)) throw new Error('Missing data envelope');
  return body.data as T;
}

async function member(name: string, role: 'user' | 'admin' = 'user', university: 'KMITL' | 'KMUTT' | 'KMUTNB' = 'KMITL') {
  const user = await UserModel.create({
    name,
    email: `${name.toLowerCase()}@${university === 'KMITL' ? 'kmitl.ac.th' : university === 'KMUTT' ? 'mail.kmutt.ac.th' : 'email.kmutnb.ac.th'}`,
    googleSub: `google-${name.toLowerCase()}`,
    university,
    role,
    emailVerified: true,
    faculty: 'Engineering',
    department: 'Computer',
  });
  return { user, token: await signAccessToken(user.id, user.role) };
}

beforeAll(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  await Promise.all([
    UserModel.syncIndexes(),
    PostModel.syncIndexes(),
    PostLikeModel.syncIndexes(),
    PostBookmarkModel.syncIndexes(),
    PostCommentModel.syncIndexes(),
    NotificationModel.syncIndexes(),
    CommunityGroupModel.syncIndexes(),
    GroupMemberModel.syncIndexes(),
    GroupPostModel.syncIndexes(),
    ReportModel.syncIndexes(),
  ]);
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    PostModel.deleteMany({}),
    PostLikeModel.deleteMany({}),
    PostBookmarkModel.deleteMany({}),
    PostCommentModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    CommunityGroupModel.deleteMany({}),
    GroupMemberModel.deleteMany({}),
    GroupPostModel.deleteMany({}),
    ReportModel.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

describe('completed social platform APIs', () => {
  it('stores reactions, exposes reaction counts, and persists notifications for the post author', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const created = await request(app).post('/api/v1/posts')
      .auth(alice.token, { type: 'bearer' })
      .send({ content: 'Reaction target' })
      .expect(201);
    const post = data<{ post: { _id: string } }>(created).post;

    const reacted = await request(app).put(`/api/v1/posts/${post._id}/reaction`)
      .auth(bob.token, { type: 'bearer' })
      .send({ reaction: 'LOVE' })
      .expect(200);
    expect(data<{ post: {
      myReaction: string; likedByMe: boolean; likeCount: number; reactionCounts: Record<string, number>;
    } }>(reacted).post).toMatchObject({
      myReaction: 'LOVE',
      likedByMe: true,
      likeCount: 1,
      reactionCounts: { LOVE: 1 },
    });

    const notifications = await request(app).get('/api/v1/notifications')
      .auth(alice.token, { type: 'bearer' })
      .expect(200);
    const notificationData = data<{ items: Array<{ type: string; entityId: string; read: boolean }>; unreadCount: number }>(notifications);
    expect(notificationData.unreadCount).toBe(1);
    expect(notificationData.items[0]).toMatchObject({
      type: 'post_reaction',
      entityId: post._id,
      read: false,
    });

    const id = (data<{ items: Array<{ id: string }> }>(notifications).items[0])?.id;
    expect(id).toBeTruthy();
    await request(app).patch(`/api/v1/notifications/${id}/read`)
      .auth(alice.token, { type: 'bearer' })
      .expect(200);
    const afterRead = await request(app).get('/api/v1/notifications?unreadOnly=1')
      .auth(alice.token, { type: 'bearer' })
      .expect(200);
    expect(data<{ total: number; unreadCount: number }>(afterRead)).toMatchObject({ total: 0, unreadCount: 0 });
  });

  it('lists the three universities and searches people, posts, groups, and institutions', async () => {
    const alice = await member('Alice', 'user', 'KMITL');
    await member('Bob', 'user', 'KMUTT');
    await request(app).post('/api/v1/posts')
      .auth(alice.token, { type: 'bearer' })
      .send({ content: 'Quantum robotics showcase' })
      .expect(201);
    await request(app).post('/api/v1/groups')
      .auth(alice.token, { type: 'bearer' })
      .send({ name: 'Quantum Builders', description: 'Robotics and AI', privacy: 'public', university: 'KMITL' })
      .expect(201);

    const universities = await request(app).get('/api/v1/universities').expect(200);
    const items = data<{ items: Array<{ code: string; memberCount: number; postCount: number }> }>(universities).items;
    expect(items.map((item) => item.code).sort()).toEqual(['KMITL', 'KMUTNB', 'KMUTT']);
    expect(items.find((item) => item.code === 'KMITL')).toMatchObject({ memberCount: 1, postCount: 1 });

    const search = await request(app).get('/api/v1/search').query({ q: 'Quantum' }).expect(200);
    const result = data<{ posts: unknown[]; groups: unknown[]; users: unknown[]; universities: unknown[] }>(search);
    expect(result.posts).toHaveLength(1);
    expect(result.groups).toHaveLength(1);

    const universitySearch = await request(app).get('/api/v1/search').query({ q: 'KMITL' }).expect(200);
    expect(data<{ universities: Array<{ code: string }> }>(universitySearch).universities)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'KMITL' })]));
  });

  it('supports public group membership/posts while keeping private group data member-only', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');

    const publicCreated = await request(app).post('/api/v1/groups')
      .auth(alice.token, { type: 'bearer' })
      .send({ name: 'AI & Machine Learning', description: 'Public learning group', privacy: 'public', university: 'KMITL' })
      .expect(201);
    const publicGroup = data<{ group: { id: string; joined: boolean; membershipRole: string } }>(publicCreated).group;
    expect(publicGroup).toMatchObject({ joined: true, membershipRole: 'owner' });

    await request(app).put(`/api/v1/groups/${publicGroup.id}/join`)
      .auth(bob.token, { type: 'bearer' })
      .expect(200);
    await request(app).post(`/api/v1/groups/${publicGroup.id}/posts`)
      .auth(bob.token, { type: 'bearer' })
      .send({ content: 'Hello community' })
      .expect(201);
    const publicPosts = await request(app).get(`/api/v1/groups/${publicGroup.id}/posts`).expect(200);
    const publicItems = data<{ items: Array<{ id: string; content: string }> }>(publicPosts).items;
    expect(publicItems).toEqual([expect.objectContaining({ content: 'Hello community' })]);
    expect(publicItems[0]?.id).toMatch(/^[a-f\d]{24}$/i);

    const privateCreated = await request(app).post('/api/v1/groups')
      .auth(alice.token, { type: 'bearer' })
      .send({ name: 'Private Lab', description: 'Members only', privacy: 'private' })
      .expect(201);
    const privateId = data<{ group: { id: string } }>(privateCreated).group.id;

    await request(app).get(`/api/v1/groups/${privateId}`).expect(404);
    await request(app).get(`/api/v1/groups/${privateId}/members`).expect(404);
    await request(app).get(`/api/v1/groups/${privateId}/posts`).expect(404);
    await request(app).get(`/api/v1/groups/${privateId}/members`)
      .auth(alice.token, { type: 'bearer' })
      .expect(200);
    await request(app).get(`/api/v1/groups/${privateId}/posts`)
      .auth(alice.token, { type: 'bearer' })
      .expect(200);
  });

  it('lets members submit reports and restricts moderation actions to admins', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const admin = await member('Moderator', 'admin');

    const created = await request(app).post('/api/v1/reports')
      .auth(bob.token, { type: 'bearer' })
      .send({
        targetType: 'user',
        targetId: alice.user.id,
        reason: 'harassment',
        details: 'Please review this account',
      })
      .expect(201);
    const reportId = data<{ report: { _id: string } }>(created).report._id;

    await request(app).get('/api/v1/reports')
      .auth(bob.token, { type: 'bearer' })
      .expect(403);
    const queue = await request(app).get('/api/v1/reports')
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    expect(data<{ items: Array<{ _id: string }> }>(queue).items[0]?._id).toBe(reportId);

    await request(app).patch(`/api/v1/reports/${reportId}`)
      .auth(admin.token, { type: 'bearer' })
      .send({ action: 'suspend_user', note: 'Reviewed by moderator' })
      .expect(200);
    expect((await UserModel.findById(alice.user.id).lean())?.isActive).toBe(false);
    expect((await ReportModel.findById(reportId).lean())?.status).toBe('resolved');
  });

  it('makes private groups fully manageable and keeps private memberships hidden from outsiders', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const carol = await member('Carol');

    const created = await request(app).post('/api/v1/groups')
      .auth(alice.token, { type: 'bearer' })
      .send({ name: 'Private Research Lab', description: 'Members only', privacy: 'private' })
      .expect(201);
    const groupId = data<{ group: { id: string } }>(created).group.id;

    await request(app).post(`/api/v1/groups/${groupId}/members`)
      .auth(alice.token, { type: 'bearer' })
      .send({ userId: bob.user.id })
      .expect(201);
    await request(app).post(`/api/v1/groups/${groupId}/members`)
      .auth(alice.token, { type: 'bearer' })
      .send({ userId: bob.user.id })
      .expect(409);

    await request(app).get(`/api/v1/groups/${groupId}`).auth(bob.token, { type: 'bearer' }).expect(200);
    await request(app).post(`/api/v1/groups/${groupId}/posts`)
      .auth(bob.token, { type: 'bearer' })
      .send({ content: 'Private group post' })
      .expect(201);

    const selfGroups = await request(app).get(`/api/v1/groups/users/${bob.user.id}`)
      .auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<{ items: Array<{ id: string }> }>(selfGroups).items.map((item) => item.id)).toContain(groupId);

    const outsiderView = await request(app).get(`/api/v1/groups/users/${bob.user.id}`)
      .auth(carol.token, { type: 'bearer' }).expect(200);
    expect(data<{ items: Array<{ id: string }> }>(outsiderView).items.map((item) => item.id)).not.toContain(groupId);

    await request(app).patch(`/api/v1/groups/${groupId}/members/${bob.user.id}`)
      .auth(alice.token, { type: 'bearer' })
      .send({ role: 'owner' })
      .expect(200);
    await request(app).delete(`/api/v1/groups/${groupId}/join`)
      .auth(alice.token, { type: 'bearer' })
      .expect(200);

    await request(app).delete(`/api/v1/groups/${groupId}`)
      .auth(bob.token, { type: 'bearer' })
      .expect(204);
    await request(app).get(`/api/v1/groups/${groupId}`).auth(bob.token, { type: 'bearer' }).expect(404);
    expect(await GroupMemberModel.countDocuments({ group: groupId })).toBe(0);
    expect(await GroupPostModel.countDocuments({ group: groupId })).toBe(0);
  });

  it('allows group post authors and moderators to remove group posts with permission checks', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const carol = await member('Carol');
    const created = await request(app).post('/api/v1/groups')
      .auth(alice.token, { type: 'bearer' })
      .send({ name: 'Builders', description: '', privacy: 'public' })
      .expect(201);
    const groupId = data<{ group: { id: string } }>(created).group.id;

    await request(app).put(`/api/v1/groups/${groupId}/join`).auth(bob.token, { type: 'bearer' }).expect(200);
    await request(app).put(`/api/v1/groups/${groupId}/join`).auth(carol.token, { type: 'bearer' }).expect(200);
    const post = data<{ post: { id: string } }>(await request(app).post(`/api/v1/groups/${groupId}/posts`)
      .auth(bob.token, { type: 'bearer' }).send({ content: 'Delete me' }).expect(201)).post;

    await request(app).delete(`/api/v1/groups/${groupId}/posts/${post.id}`)
      .auth(carol.token, { type: 'bearer' }).expect(403);
    await request(app).patch(`/api/v1/groups/${groupId}/members/${carol.user.id}`)
      .auth(alice.token, { type: 'bearer' }).send({ role: 'moderator' }).expect(200);
    await request(app).delete(`/api/v1/groups/${groupId}/posts/${post.id}`)
      .auth(carol.token, { type: 'bearer' }).expect(204);
    expect(await GroupPostModel.exists({ _id: post.id })).toBeNull();
  });

  it('validates report targets, prevents duplicate pending reports, cleans content, and can restore a suspended user', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const admin = await member('Moderator', 'admin');

    await request(app).post('/api/v1/reports')
      .auth(bob.token, { type: 'bearer' })
      .send({ targetType: 'post', targetId: new mongoose.Types.ObjectId().toHexString(), reason: 'spam', details: '' })
      .expect(404);

    const postCreated = await request(app).post('/api/v1/posts')
      .auth(alice.token, { type: 'bearer' }).send({ content: 'Moderation cleanup' }).expect(201);
    const postId = data<{ post: { _id: string } }>(postCreated).post._id;
    await request(app).put(`/api/v1/posts/${postId}/reaction`)
      .auth(bob.token, { type: 'bearer' }).send({ reaction: 'LIKE' }).expect(200);
    await request(app).put(`/api/v1/posts/${postId}/bookmark`)
      .auth(bob.token, { type: 'bearer' }).expect(200);
    const commentCreated = await request(app).post(`/api/v1/posts/${postId}/comments`)
      .auth(bob.token, { type: 'bearer' }).send({ content: 'Comment' }).expect(201);
    expect(data<{ comment: { _id: string } }>(commentCreated).comment._id).toBeTruthy();

    const reportPost = await request(app).post('/api/v1/reports')
      .auth(bob.token, { type: 'bearer' })
      .send({ targetType: 'post', targetId: postId, reason: 'inappropriate', details: '' })
      .expect(201);
    await request(app).post('/api/v1/reports')
      .auth(bob.token, { type: 'bearer' })
      .send({ targetType: 'post', targetId: postId, reason: 'spam', details: '' })
      .expect(409);
    const postReportId = data<{ report: { _id: string } }>(reportPost).report._id;
    await request(app).patch(`/api/v1/reports/${postReportId}`)
      .auth(admin.token, { type: 'bearer' }).send({ action: 'remove_content' }).expect(200);
    expect(await PostModel.exists({ _id: postId })).toBeNull();
    expect(await PostLikeModel.countDocuments({ post: postId })).toBe(0);
    expect(await PostBookmarkModel.countDocuments({ post: postId })).toBe(0);
    expect(await PostCommentModel.countDocuments({ post: postId })).toBe(0);

    const userReport = await request(app).post('/api/v1/reports')
      .auth(bob.token, { type: 'bearer' })
      .send({ targetType: 'user', targetId: alice.user.id, reason: 'harassment', details: '' })
      .expect(201);
    const userReportId = data<{ report: { _id: string } }>(userReport).report._id;
    await request(app).patch(`/api/v1/reports/${userReportId}`)
      .auth(admin.token, { type: 'bearer' }).send({ action: 'suspend_user' }).expect(200);
    expect((await UserModel.findById(alice.user.id).lean())?.isActive).toBe(false);
    await request(app).get('/api/v1/posts/mine').auth(alice.token, { type: 'bearer' }).expect(403);

    await request(app).patch(`/api/v1/reports/${userReportId}`)
      .auth(admin.token, { type: 'bearer' }).send({ action: 'restore_user' }).expect(200);
    expect((await UserModel.findById(alice.user.id).lean())?.isActive).toBe(true);
  });

  it('supports reporting and removing a community group post', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const admin = await member('Moderator', 'admin');
    const group = data<{ group: { id: string } }>(await request(app).post('/api/v1/groups')
      .auth(alice.token, { type: 'bearer' })
      .send({ name: 'Reportable group', description: '', privacy: 'public' }).expect(201)).group;
    await request(app).put(`/api/v1/groups/${group.id}/join`).auth(bob.token, { type: 'bearer' }).expect(200);
    const groupPost = data<{ post: { id: string } }>(await request(app).post(`/api/v1/groups/${group.id}/posts`)
      .auth(bob.token, { type: 'bearer' }).send({ content: 'Bad group post' }).expect(201)).post;

    const report = await request(app).post('/api/v1/reports')
      .auth(alice.token, { type: 'bearer' })
      .send({ targetType: 'group_post', targetId: groupPost.id, reason: 'spam', details: '' })
      .expect(201);
    const reportId = data<{ report: { _id: string } }>(report).report._id;
    await request(app).patch(`/api/v1/reports/${reportId}`)
      .auth(admin.token, { type: 'bearer' }).send({ action: 'remove_content' }).expect(200);
    expect(await GroupPostModel.exists({ _id: groupPost.id })).toBeNull();
  });


  it('sends join notifications to the current community owner after ownership transfer', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const carol = await member('Carol');

    const created = await request(app).post('/api/v1/groups')
      .auth(alice.token, { type: 'bearer' })
      .send({ name: 'Ownership transfer', description: '', privacy: 'public' })
      .expect(201);
    const groupId = data<{ group: { id: string } }>(created).group.id;

    await request(app).put(`/api/v1/groups/${groupId}/join`)
      .auth(bob.token, { type: 'bearer' }).expect(200);
    await request(app).patch(`/api/v1/groups/${groupId}/members/${bob.user.id}`)
      .auth(alice.token, { type: 'bearer' })
      .send({ role: 'owner' }).expect(200);

    await NotificationModel.deleteMany({});
    await request(app).put(`/api/v1/groups/${groupId}/join`)
      .auth(carol.token, { type: 'bearer' }).expect(200);

    const bobNotifications = await request(app).get('/api/v1/notifications')
      .auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<{ items: Array<{ type: string; entityId: string }> }>(bobNotifications).items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'group_join', entityId: groupId })]));

    const aliceNotifications = await request(app).get('/api/v1/notifications')
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<{ items: Array<{ type: string; entityId: string }> }>(aliceNotifications).items)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'group_join', entityId: groupId })]));
  });

});
