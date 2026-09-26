import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import request, { type Response as TestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { PostModel } from '../src/modules/posts/post.model.js';
import { SessionModel } from '../src/modules/auth/session.model.js';
import { OAuthTransactionModel } from '../src/modules/auth/oauth-transaction.model.js';
import { universityForEmail } from '../src/modules/auth/university-email.js';
import { safeReturnTo } from '../src/modules/auth/return-to.js';
import { verifyGoogleIdToken } from '../src/modules/auth/google.service.js';
import { googleLogin } from '../src/modules/auth/auth.service.js';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/modules/auth/token.service.js';

const app = createApp();
const authPayload = z.object({ data: z.object({
  accessToken: z.string(),
  user: z.object({ _id: z.string(), email: z.string(), role: z.string(), university: z.string(),
    faculty: z.string().optional(), department: z.string().optional(), needsProfileCompletion: z.boolean(),
  }).passthrough(),
}) });
const errorPayload = z.object({ error: z.object({ code: z.string() }) });
let database: MongoMemoryServer;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let tokenResponse = '';
let exchangeBody = new URLSearchParams();
let failExchange = false;

function cookies(response: TestResponse): string[] {
  return z.array(z.string()).parse(response.headers['set-cookie']);
}
function location(response: TestResponse): URL {
  return new URL(z.string().parse(response.headers.location));
}
async function googleToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    sub: 'google-student', email: 'student@kmitl.ac.th', email_verified: true,
    hd: 'kmitl.ac.th', name: 'Student Name', nonce: 'nonce',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
    iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, ...overrides,
  }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(keys.privateKey);
}
async function start(returnTo = '/dashboard') {
  const response = await request(app).get('/api/v1/auth/google').query({ returnTo }).expect(302);
  return { url: location(response), cookie: cookies(response)[0]!.split(';')[0]! };
}
async function callback(flow: Awaited<ReturnType<typeof start>>, claims: JWTPayload = {}) {
  tokenResponse = await googleToken({ nonce: flow.url.searchParams.get('nonce')!, ...claims });
  return request(app).get('/api/v1/auth/google/callback')
    .query({ state: flow.url.searchParams.get('state'), code: 'private-google-code' })
    .set('Cookie', flow.cookie);
}
async function member(complete = false) {
  const user = await UserModel.create({
    name: 'Existing Member', email: 'member@kmitl.ac.th', university: 'KMITL',
    googleSub: 'google-member', emailVerified: true,
    ...(complete ? { faculty: 'Engineering', department: 'Computer' } : {}),
  });
  return { user, token: await signAccessToken(user.id, user.role) };
}

beforeAll(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  await Promise.all([UserModel.syncIndexes(), OAuthTransactionModel.syncIndexes(), SessionModel.syncIndexes()]);
  keys = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  vi.stubGlobal('fetch', vi.fn((input: string | URL, init?: RequestInit) => {
    if (String(input) === 'https://www.googleapis.com/oauth2/v3/certs') {
      return Promise.resolve(Response.json({ keys: [jwk] }));
    }
    if (String(input) === 'https://oauth2.googleapis.com/token') {
      if (!(init?.body instanceof URLSearchParams)) throw new Error('Expected form-encoded token request');
      exchangeBody = new URLSearchParams(init.body);
      return Promise.resolve(failExchange ? Response.json({ error: 'invalid_grant' }, { status: 400 })
        : Response.json({ id_token: tokenResponse }));
    }
    throw new Error('Unexpected external request in test');
  }));
}, 120_000);

beforeEach(async () => {
  failExchange = false;
  await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({}), OAuthTransactionModel.deleteMany({}), PostModel.deleteMany({})]);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await mongoose.disconnect();
  await database?.stop();
});

describe('university identity verification', () => {
  it.each([
    ['student@kmitl.ac.th', 'kmitl.ac.th', 'KMITL'],
    ['student@mail.kmutt.ac.th', 'kmutt.ac.th', 'KMUTT'],
    ['student@email.kmutnb.ac.th', 'email.kmutnb.ac.th', 'KMUTNB'],
  ])('accepts %s with a verified Workspace identity', async (email, hd, university) => {
    const identity = await verifyGoogleIdToken(await googleToken({ email, hd }), 'nonce');
    expect(identity).toMatchObject({ email, university });
  });

  it.each(['student@gmail.com', 'student@kmutt.ac.th', 'student@kmutnb.ac.th', 'student@sub.kmitl.ac.th',
    'student@kmitl.ac.th.evil.test', 'student@fakekmitl.ac.th', 'student@other.ac.th', '@kmitl.ac.th'])('rejects unsupported email %s', (email) => { expect(universityForEmail(email)).toBeUndefined(); });

  it.each([
    { email_verified: false }, { hd: undefined }, { hd: 'evil.test' }, { hd: 'kmutt.ac.th' },
    { nonce: 'attacker' }, { aud: 'another-app' }, { iss: 'https://attacker.test' },
    { exp: 1 }, { exp: undefined }, { sub: '' }, { azp: 'another-app' },
  ])('rejects invalid claims %j', async (claims) => {
    await expect(verifyGoogleIdToken(await googleToken(claims), 'nonce')).rejects.toThrow();
  });

  it('rejects a forged signature', async () => {
    const wrongKey = await generateKeyPair('RS256');
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(wrongKey.privateKey);
    await expect(verifyGoogleIdToken(token, 'nonce')).rejects.toThrow();
  });
});

describe('OAuth and session lifecycle', () => {
  it('creates a browser-bound PKCE flow, registers, restores and revokes a session', async () => {
    const flow = await start('/connections?university=KMITL');
    expect(flow.url.searchParams.get('prompt')).toBe('select_account');
    expect(flow.url.searchParams.get('scope')).toBe('openid email profile');
    expect(flow.url.searchParams.get('code_challenge_method')).toBe('S256');
    const transaction = await OAuthTransactionModel.findOne().orFail();
    expect(transaction.stateHash).not.toBe(flow.url.searchParams.get('state'));
    expect(transaction.expiresAt.getTime() - Date.now()).toBeGreaterThan(590_000);
    const response = await callback(flow);
    expect(response.status).toBe(303);
    expect(location(response).pathname).toBe('/auth/callback');
    expect(location(response).searchParams.get('returnTo')).toBe('/connections?university=KMITL');
    expect(location(response).searchParams.has('code')).toBe(false);
    expect(location(response).searchParams.has('accessToken')).toBe(false);
    expect(exchangeBody.get('code_verifier')).toBe(transaction.codeVerifier);
    expect(createHash('sha256').update(transaction.codeVerifier).digest('base64url'))
      .toBe(flow.url.searchParams.get('code_challenge'));
    expect(await OAuthTransactionModel.countDocuments()).toBe(0);
    const refreshCookie = cookies(response).find((cookie) => cookie.startsWith('refresh_token='))!;
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/api/v1/auth');
    const restored = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie.split(';')[0]!).expect(200);
    const payload = authPayload.parse(restored.body).data;
    expect(payload.user).toMatchObject({ email: 'student@kmitl.ac.th', university: 'KMITL', needsProfileCompletion: true });
    expect(payload.user).not.toHaveProperty('googleSub');
    expect(payload.user).not.toHaveProperty('passwordHash');
    const me = await request(app).get('/api/v1/auth/me').auth(payload.accessToken, { type: 'bearer' }).expect(200);
    expect(me.body).toMatchObject({ data: { user: { _id: payload.user._id } } });
    await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie.split(';')[0]!).expect(401);
    const rotatedCookie = cookies(restored)[0]!.split(';')[0]!;
    await request(app).post('/api/v1/auth/logout').set('Cookie', rotatedCookie).expect(204);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', rotatedCookie).expect(401);
    await request(app).post('/api/v1/auth/logout').expect(204);
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it('fails closed without OAuth credentials', async () => {
    const clientId = env.GOOGLE_CLIENT_ID;
    env.GOOGLE_CLIENT_ID = '';
    try {
      const response = await request(app).get('/api/v1/auth/google').query({ returnTo: '//evil.test' }).expect(303);
      expect(location(response).origin).toBe(new URL(env.FRONTEND_URL).origin);
      expect(location(response).searchParams.get('error')).toBe('GOOGLE_NOT_CONFIGURED');
      expect(location(response).searchParams.get('returnTo')).toBe('/dashboard');
      expect(await OAuthTransactionModel.countDocuments()).toBe(0);
    } finally {
      env.GOOGLE_CLIENT_ID = clientId;
    }
  });

  it('consumes concurrent callbacks only once', async () => {
    const flow = await start();
    const responses = await Promise.all([callback(flow), callback(flow)]);
    expect(responses.filter((response) => location(response).pathname === '/auth/callback')).toHaveLength(1);
    expect(responses.filter((response) => location(response).searchParams.get('error') === 'GOOGLE_SESSION_EXPIRED')).toHaveLength(1);
    expect(await SessionModel.countDocuments()).toBe(1);
  });

  it('links legacy users without losing identity, name, role or stored profile', async () => {
    const legacy = await UserModel.create({ name: 'Original Name', email: 'student@kmitl.ac.th',
      passwordHash: 'legacy-hash', university: 'KMUTT', role: 'admin', faculty: 'Engineering', department: 'Computer' });
    await callback(await start());
    await callback(await start());
    const linked = await UserModel.findById(legacy._id).select('+googleSub').orFail();
    expect(linked).toMatchObject({ name: 'Original Name', role: 'admin', university: 'KMITL',
      googleSub: 'google-student', faculty: 'Engineering', emailVerified: true });
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it('handles simultaneous first logins without duplicate users', async () => {
    const identity = { sub: 'same-google-sub', email: 'same@kmitl.ac.th', name: 'Same Student', university: 'KMITL' as const };
    const results = await Promise.all([googleLogin(identity), googleLogin(identity)]);
    expect(results[0].user.id).toBe(results[1].user.id);
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it('rejects an email linked to a different Google subject', async () => {
    await UserModel.create({ name: 'Other Identity', email: 'student@kmitl.ac.th', university: 'KMITL', googleSub: 'other-sub' });
    const response = await callback(await start());
    expect(location(response).searchParams.get('error')).toBe('GOOGLE_ACCOUNT_CONFLICT');
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it('rejects a subject changing email to another existing account', async () => {
    await UserModel.create({ name: 'Original', email: 'old@kmitl.ac.th', university: 'KMITL', googleSub: 'google-student' });
    await UserModel.create({ name: 'Other', email: 'student@kmitl.ac.th', university: 'KMITL' });
    expect(location(await callback(await start())).searchParams.get('error')).toBe('GOOGLE_ACCOUNT_CONFLICT');
  });

  it('rejects wrong binding/state, expired transactions and replayed callbacks', async () => {
    const flow = await start();
    const wrongBrowser = await request(app).get('/api/v1/auth/google/callback')
      .query({ state: flow.url.searchParams.get('state'), code: 'code' }).expect(303);
    expect(location(wrongBrowser).searchParams.get('error')).toBe('GOOGLE_SESSION_EXPIRED');
    const wrongState = await request(app).get('/api/v1/auth/google/callback').set('Cookie', flow.cookie)
      .query({ state: 'x'.repeat(43), code: 'code' });
    expect(location(wrongState).searchParams.get('error')).toBe('GOOGLE_SESSION_EXPIRED');
    expect(location(await callback(flow)).pathname).toBe('/auth/callback');
    expect(location(await callback(flow)).searchParams.get('error')).toBe('GOOGLE_SESSION_EXPIRED');
    const expired = await start();
    await OAuthTransactionModel.updateMany({}, { $set: { expiresAt: new Date(0) } });
    expect(location(await callback(expired)).searchParams.get('error')).toBe('GOOGLE_SESSION_EXPIRED');
  });

  it('returns recoverable errors for cancellation, provider failure and unsupported email', async () => {
    const flow = await start('/connections');
    const denied = await request(app).get('/api/v1/auth/google/callback').set('Cookie', flow.cookie)
      .query({ state: flow.url.searchParams.get('state'), error: 'access_denied' });
    expect(location(denied).searchParams.get('error')).toBe('GOOGLE_CANCELLED');
    expect(location(denied).searchParams.get('returnTo')).toBe('/connections');
    expect(location(await callback(await start(), { email: 'student@gmail.com' })).searchParams.get('error'))
      .toBe('UNIVERSITY_EMAIL_REQUIRED');
    failExchange = true;
    expect(location(await callback(await start())).searchParams.get('error')).toBe('GOOGLE_LOGIN_FAILED');
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it('blocks inactive accounts during login, refresh, and member requests', async () => {
    const { user, token } = await member(true);
    const refresh = await signRefreshToken(user.id);
    await SessionModel.create({ user: user._id, tokenHash: createHash('sha256').update(refresh.jti).digest('hex'), expiresAt: refresh.expiresAt });
    user.isActive = false;
    await user.save();
    const response = await callback(await start(), { sub: 'google-member', email: 'member@kmitl.ac.th' });
    expect(location(response).searchParams.get('error')).toBe('ACCOUNT_INACTIVE');
    await request(app).get('/api/v1/auth/me').auth(token, { type: 'bearer' }).expect(403);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', 'refresh_token=' + refresh.token).expect(403);
  });

  it('retires password endpoints and rejects tokens issued before Google-only auth', async () => {
    await request(app).post('/api/v1/auth/login').send({ email: 'student@kmitl.ac.th', password: 'old' }).expect(410);
    await request(app).post('/api/v1/auth/register').send({}).expect(410);
    for (const kind of ['access', 'refresh']) {
      const legacy = await new SignJWT({ role: 'user', tokenType: kind })
        .setProtectedHeader({ alg: 'HS256' }).setSubject(new mongoose.Types.ObjectId().toHexString())
        .setJti('old-session').setIssuer('king-mongkut-social-api').setAudience('king-mongkut-social-app')
        .setExpirationTime('5m').sign(new TextEncoder().encode(kind === 'access' ? env.ACCESS_TOKEN_SECRET : env.REFRESH_TOKEN_SECRET));
      await expect(kind === 'access' ? verifyAccessToken(legacy) : verifyRefreshToken(legacy)).rejects.toThrow();
    }
  });
});

describe('persisted profile gate', () => {
  it('does not let incomplete profiles use optional auth to access drafts', async () => {
    const { user } = await member();
    const token = await signAccessToken(user.id, user.role);
    const draft = await PostModel.create({ user: user._id, title: 'Draft', content: 'Private', status: 'draft' });
    const published = await PostModel.create({ user: user._id, title: 'Published', content: 'Public', status: 'published' });
    await request(app).get('/api/v1/posts/' + draft.id).auth(token, { type: 'bearer' }).expect(404);
    await request(app).get('/api/v1/posts/' + published.id).auth(token, { type: 'bearer' }).expect(200);
    await request(app).patch('/api/v1/posts/' + draft.id).auth(token, { type: 'bearer' }).send({ title: 'Changed' }).expect(403);
    await request(app).delete('/api/v1/posts/' + draft.id).auth(token, { type: 'bearer' }).expect(403);
    await request(app).patch('/api/v1/auth/profile').auth(token, { type: 'bearer' })
      .send({ faculty: 'Engineering', department: 'Computer' }).expect(200);
    const visible = await request(app).get('/api/v1/posts/' + draft.id).auth(token, { type: 'bearer' }).expect(200);
    expect(visible.body).toMatchObject({ data: { post: { user: { faculty: 'Engineering', department: 'Computer' } } } });
  });

  it('allows session and public reads, blocks member APIs until both fields are saved', async () => {
    const { token, user } = await member();
    await request(app).get('/api/v1/auth/me').auth(token, { type: 'bearer' }).expect(200);
    await request(app).get('/api/v1/posts').expect(200);
    for (const path of ['/api/v1/posts/mine', '/api/v1/friends/search']) {
      const response = await request(app).get(path).auth(token, { type: 'bearer' }).expect(403);
      expect(errorPayload.parse(response.body).error.code).toBe('PROFILE_INCOMPLETE');
    }
    await request(app).post('/api/v1/posts').auth(token, { type: 'bearer' }).send({ title: 'Test', content: 'Test' }).expect(403);
    await request(app).patch('/api/v1/auth/profile').send({ faculty: 'Engineering', department: 'Computer' }).expect(401);
    for (const fields of [
      { faculty: ' ', department: 'Computer' }, { faculty: 'Engineering' },
      { faculty: 'a'.repeat(151), department: 'Computer' },
      { faculty: 'Engineering', department: 'Computer', role: 'admin' },
    ]) await request(app).patch('/api/v1/auth/profile').auth(token, { type: 'bearer' }).send(fields).expect(422);
    const response = await request(app).patch('/api/v1/auth/profile').auth(token, { type: 'bearer' })
      .send({ faculty: ' Engineering ', department: ' Computer ' }).expect(200);
    expect(response.body).toMatchObject({ data: { user: { faculty: 'Engineering', department: 'Computer', needsProfileCompletion: false } } });
    const persisted = await UserModel.findById(user._id).orFail();
    expect(persisted.faculty).toBe('Engineering');
    await request(app).get('/api/v1/posts/mine').auth(token, { type: 'bearer' }).expect(200);
    const loginAgain = await googleLogin({ sub: 'google-member', email: user.email, name: user.name, university: 'KMITL' });
    const reload = await request(app).post('/api/v1/auth/refresh').set('Cookie', 'refresh_token=' + loginAgain.tokens.refreshToken).expect(200);
    expect(authPayload.parse(reload.body).data.user.needsProfileCompletion).toBe(false);
  });
});

describe('safe return paths', () => {
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/%2f%2fevil.test', '/%5cevil.test',
    '/login', '/register', '/auth/callback', '/complete-profile', '/x/../login', '/%6cogin', '/bad%'])('rejects unsafe or looping return path %s', (value) => { expect(safeReturnTo(value)).toBe('/dashboard'); });
  it('preserves local paths, queries and fragments', () => {
    expect(safeReturnTo('/posts/123?view=full#comments')).toBe('/posts/123?view=full#comments');
  });
});
