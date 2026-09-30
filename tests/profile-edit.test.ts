import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { type Response as TestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { sha256 } from '../src/common/utils/hash.js';
import { env } from '../src/config/env.js';
import { SessionModel } from '../src/modules/auth/session.model.js';
import { signAccessToken, signRefreshToken } from '../src/modules/auth/token.service.js';
import { UserModel } from '../src/modules/users/user.model.js';

const app = createApp();
let database: MongoMemoryServer;

type ProfileUser = {
  _id: string;
  name: string;
  username: string | null;
  bio: string;
  academicYear: number | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  university: string;
  faculty: string;
  department: string;
  needsProfileCompletion: boolean;
};

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
  await Promise.all([UserModel.syncIndexes(), SessionModel.syncIndexes()]);
}, 120_000);

beforeEach(async () => {
  await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]);
  await rm(resolve(env.UPLOAD_DIR, 'profiles'), { recursive: true, force: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
  const uploadPath = resolve(env.UPLOAD_DIR);
  if (dirname(uploadPath) === resolve(tmpdir()) && basename(uploadPath).startsWith('king-mongkut-social-posts-test-')) {
    await rm(resolve(uploadPath, 'profiles'), { recursive: true, force: true });
  }
});

describe('editable profiles', () => {
  it('updates safe profile fields and exposes them through public profile and auth/me', async () => {
    const alice = await member('Alice');
    const updated = data<{ user: ProfileUser }>(await request(app).patch('/api/v1/users/me/profile')
      .auth(alice.token, { type: 'bearer' })
      .send({
        name: ' Alice Example ', username: 'Alice.Example', bio: ' I build things ',
        faculty: 'Science', department: 'Physics', academicYear: 2,
      }).expect(200)).user;
    expect(updated).toMatchObject({
      name: 'Alice Example', username: 'alice.example', bio: 'I build things',
      faculty: 'Science', department: 'Physics', academicYear: 2,
      university: 'KMITL', needsProfileCompletion: false,
    });
    expect(updated).not.toHaveProperty('googleSub');
    expect(updated).not.toHaveProperty('passwordHash');

    const me = data<{ user: ProfileUser }>(await request(app).get('/api/v1/auth/me')
      .auth(alice.token, { type: 'bearer' }).expect(200)).user;
    expect(me).toMatchObject({ username: 'alice.example', bio: 'I build things', academicYear: 2 });
    const refreshToken = await signRefreshToken(alice.user.id);
    await SessionModel.create({ user: alice.user.id, tokenHash: sha256(refreshToken.jti), expiresAt: refreshToken.expiresAt });
    const refreshed = data<{ user: ProfileUser; accessToken: string }>(await request(app)
      .post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${refreshToken.token}`).expect(200));
    expect(refreshed.user).toMatchObject({ username: 'alice.example', bio: 'I build things', academicYear: 2 });
    expect(refreshed.accessToken).toEqual(expect.any(String));
    const publicProfile = data<{ profile: ProfileUser & { id: string } }>(await request(app)
      .get(`/api/v1/users/${alice.user.id}/profile`).expect(200)).profile;
    expect(publicProfile).toMatchObject({ id: alice.user.id, username: 'alice.example', bio: 'I build things', academicYear: 2, avatarUrl: null, coverUrl: null });
    expect(publicProfile).not.toHaveProperty('email');
    expect(publicProfile).not.toHaveProperty('role');
    expect(publicProfile).not.toHaveProperty('googleSub');
  });

  it('normalizes usernames, enforces unique names, allows legacy nulls and rejects invalid changes', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    await request(app).patch('/api/v1/users/me/profile').send({ name: 'Nobody' }).expect(401);
    await request(app).patch('/api/v1/users/me/profile').auth(alice.token, { type: 'bearer' })
      .send({ username: ' User.One ' }).expect(200);
    const taken = await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({ username: 'USER.ONE' }).expect(409);
    expect(taken.body as unknown).toMatchObject({ error: { code: 'USERNAME_TAKEN' } });
    await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({ username: 'bad space' }).expect(422);
    await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({ username: 'ab' }).expect(422);
    await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({ username: '.bad' }).expect(422);
    await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({ university: 'KMUTT' }).expect(422);
    await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({ academicYear: 9 }).expect(422);
    await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({ avatarUrl: 'https://example.org/evil.png' }).expect(422);
    await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({}).expect(422);
    const cleared = data<{ user: ProfileUser }>(await request(app).patch('/api/v1/users/me/profile')
      .auth(alice.token, { type: 'bearer' }).send({ username: null, bio: '', academicYear: null }).expect(200)).user;
    expect(cleared).toMatchObject({ username: null, bio: '', academicYear: null });
    await request(app).patch('/api/v1/users/me/profile').auth(bob.token, { type: 'bearer' })
      .send({ username: 'user.one' }).expect(200);
  });

  it('keeps completion requirements while allowing an incomplete user to edit other profile fields', async () => {
    const incomplete = await member('Incomplete', false);
    const updated = data<{ user: ProfileUser }>(await request(app).patch('/api/v1/users/me/profile')
      .auth(incomplete.token, { type: 'bearer' }).send({ bio: 'Still completing' }).expect(200)).user;
    expect(updated.needsProfileCompletion).toBe(true);
    await request(app).patch('/api/v1/users/me/profile').auth(incomplete.token, { type: 'bearer' })
      .send({ faculty: '' }).expect(422);
    const completed = data<{ user: ProfileUser }>(await request(app).patch('/api/v1/auth/profile')
      .auth(incomplete.token, { type: 'bearer' })
      .send({ faculty: 'Engineering', department: 'Computer' }).expect(200)).user;
    expect(completed.needsProfileCompletion).toBe(false);
    expect(completed.bio).toBe('Still completing');
  });

  it('uploads checked avatar and cover images, serves them, and clears them', async () => {
    const alice = await member('Alice');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    await request(app).post('/api/v1/users/me/avatar').attach('file', png,
      { filename: 'avatar.png', contentType: 'image/png' }).expect(401);
    const avatar = data<{ user: ProfileUser; asset: { url: string; mimeType: string; size: number } }>(
      await request(app).post('/api/v1/users/me/avatar').auth(alice.token, { type: 'bearer' })
        .attach('file', png, { filename: 'avatar.png', contentType: 'image/png' }).expect(201));
    expect(avatar.asset).toMatchObject({ mimeType: 'image/png', size: png.length });
    expect(avatar.asset.url).toMatch(/^\/api\/v1\/users\/uploads\/[a-f0-9-]{36}\.png$/);
    expect(avatar.user.avatarUrl).toBe(avatar.asset.url);
    const served = await request(app).get(avatar.asset.url).expect(200);
    expect(served.headers['content-type']).toMatch(/^image\/png/);
    expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');

    const cover = data<{ user: ProfileUser; asset: { url: string } }>(await request(app).post('/api/v1/users/me/cover')
      .auth(alice.token, { type: 'bearer' })
      .attach('file', png, { filename: 'cover.png', contentType: 'image/png' }).expect(201));
    expect(cover.user.coverUrl).toBe(cover.asset.url);
    expect(data<{ profile: ProfileUser }>(await request(app).get(`/api/v1/users/${alice.user.id}/profile`)
      .expect(200)).profile).toMatchObject({ avatarUrl: avatar.asset.url, coverUrl: cover.asset.url });

    const clearedAvatar = data<{ user: ProfileUser }>(await request(app).delete('/api/v1/users/me/avatar')
      .auth(alice.token, { type: 'bearer' }).expect(200)).user;
    expect(clearedAvatar).toMatchObject({ avatarUrl: null, coverUrl: cover.asset.url });
    const clearedCover = data<{ user: ProfileUser }>(await request(app).delete('/api/v1/users/me/cover')
      .auth(alice.token, { type: 'bearer' }).expect(200)).user;
    expect(clearedCover.coverUrl).toBeNull();
  });

  it('rejects spoofed, unsupported and oversized images without changing saved URLs', async () => {
    const alice = await member('Alice');
    const svg = Buffer.from('<svg></svg>');
    await request(app).post('/api/v1/users/me/avatar').auth(alice.token, { type: 'bearer' })
      .attach('file', svg, { filename: 'evil.svg', contentType: 'image/svg+xml' }).expect(415);
    await request(app).post('/api/v1/users/me/avatar').auth(alice.token, { type: 'bearer' })
      .attach('file', svg, { filename: 'fake.png', contentType: 'image/png' }).expect(415);
    await request(app).post('/api/v1/users/me/avatar').auth(alice.token, { type: 'bearer' })
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 1), { filename: 'large.png', contentType: 'image/png' }).expect(413);
    await request(app).post('/api/v1/users/me/cover').auth(alice.token, { type: 'bearer' })
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 1), { filename: 'large.png', contentType: 'image/png' }).expect(413);
    await request(app).get('/api/v1/users/uploads/not-an-image.png').expect(404);
    const me = data<{ user: ProfileUser }>(await request(app).get('/api/v1/auth/me')
      .auth(alice.token, { type: 'bearer' }).expect(200)).user;
    expect(me).toMatchObject({ avatarUrl: null, coverUrl: null });
    expect(await readdir(resolve(env.UPLOAD_DIR, 'profiles')).catch(() => [])).toHaveLength(0);
  });
});
