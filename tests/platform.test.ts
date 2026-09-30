import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { type Response as TestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/modules/auth/token.service.js';
import { CommunityGroupModel } from '../src/modules/groups/group.model.js';
import { GroupInviteModel } from '../src/modules/groups/group-invite.model.js';
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
    NotificationModel.syncIndexes(),
    CommunityGroupModel.syncIndexes(),
    GroupMemberModel.syncIndexes(),
    GroupInviteModel.syncIndexes(),
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
    GroupInviteModel.deleteMany({}),
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
    expect(data<{ items: Array<{ content: string }> }>(publicPosts).items)
      .toEqual([expect.objectContaining({ content: 'Hello community' })]);

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


  it('supports private group invitations and exposes joined community groups', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const eve = await member('Eve');

    const created = await request(app).post('/api/v1/groups')
      .auth(alice.token, { type: 'bearer' })
      .send({ name: 'Private Robotics Lab', description: 'Invite only', privacy: 'private', university: 'KMITL' })
      .expect(201);
    const groupId = data<{ group: { id: string } }>(created).group.id;

    await request(app).post(`/api/v1/groups/${groupId}/invites`)
      .auth(eve.token, { type: 'bearer' })
      .send({ userId: bob.user.id })
      .expect(403);

    const invited = await request(app).post(`/api/v1/groups/${groupId}/invites`)
      .auth(alice.token, { type: 'bearer' })
      .send({ userId: bob.user.id })
      .expect(201);
    const inviteId = data<{ invitation: { id: string } }>(invited).invitation.id;

    const invitations = await request(app).get('/api/v1/groups/invitations')
      .auth(bob.token, { type: 'bearer' })
      .expect(200);
    const invitationItems = data<{ items: Array<{ id: string; group: { id: string; name: string } }> }>(invitations).items;
    expect(invitationItems).toHaveLength(1);
    expect(invitationItems[0]?.id).toBe(inviteId);
    expect(invitationItems[0]?.group).toMatchObject({ id: groupId, name: 'Private Robotics Lab' });

    await request(app).get(`/api/v1/groups/${groupId}`)
      .auth(bob.token, { type: 'bearer' })
      .expect(404);

    await request(app).patch(`/api/v1/groups/invitations/${inviteId}`)
      .auth(bob.token, { type: 'bearer' })
      .send({ action: 'accept' })
      .expect(200);

    await request(app).get(`/api/v1/groups/${groupId}`)
      .auth(bob.token, { type: 'bearer' })
      .expect(200);
    const mine = await request(app).get('/api/v1/groups/mine')
      .auth(bob.token, { type: 'bearer' })
      .expect(200);
    expect(data<{ items: Array<{ id: string }> }>(mine).items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: groupId })]));
  });

  it('rejects reports for missing targets and cleans post relations during moderation', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const admin = await member('Moderator', 'admin');

    await request(app).post('/api/v1/reports')
      .auth(bob.token, { type: 'bearer' })
      .send({
        targetType: 'post',
        targetId: new mongoose.Types.ObjectId().toString(),
        reason: 'spam',
        details: '',
      })
      .expect(404);

    const created = await request(app).post('/api/v1/posts')
      .auth(alice.token, { type: 'bearer' })
      .send({ content: 'Moderation cleanup target' })
      .expect(201);
    const postId = data<{ post: { _id: string } }>(created).post._id;

    await request(app).put(`/api/v1/posts/${postId}/reaction`)
      .auth(bob.token, { type: 'bearer' }).send({ reaction: 'LIKE' }).expect(200);
    await request(app).put(`/api/v1/posts/${postId}/bookmark`)
      .auth(bob.token, { type: 'bearer' }).expect(200);
    await request(app).post(`/api/v1/posts/${postId}/comments`)
      .auth(bob.token, { type: 'bearer' }).send({ content: 'review this' }).expect(201);

    const reported = await request(app).post('/api/v1/reports')
      .auth(bob.token, { type: 'bearer' })
      .send({ targetType: 'post', targetId: postId, reason: 'inappropriate', details: 'cleanup test' })
      .expect(201);
    const reportId = data<{ report: { _id: string } }>(reported).report._id;

    await request(app).patch(`/api/v1/reports/${reportId}`)
      .auth(admin.token, { type: 'bearer' })
      .send({ action: 'remove_content' })
      .expect(200);

    expect(await PostModel.countDocuments({ _id: postId })).toBe(0);
    expect(await PostLikeModel.countDocuments({ post: postId })).toBe(0);
    expect(await PostBookmarkModel.countDocuments({ post: postId })).toBe(0);
    expect(await PostCommentModel.countDocuments({ post: postId })).toBe(0);
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
});
