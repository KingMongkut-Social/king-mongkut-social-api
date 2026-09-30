import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { type Response as TestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/modules/auth/token.service.js';
import { FriendshipModel } from '../src/modules/friends/friendship.model.js';
import { UserModel } from '../src/modules/users/user.model.js';

const app = createApp();
let database: MongoMemoryServer;

type FriendshipData = { _id: string; status: string; recipient: string };
type PublicUser = { id: string; name: string };
type FriendRequestData = { id: string; requester: PublicUser; recipient: PublicUser };
type ConnectionData = PublicUser & { mutualFriendCount: number; relationshipStatus: string };

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
  await Promise.all([UserModel.syncIndexes(), FriendshipModel.syncIndexes()]);
}, 120_000);

beforeEach(async () => {
  await Promise.all([FriendshipModel.deleteMany({}), UserModel.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

describe('friend requests', () => {
  it('requires an authenticated member with a complete profile', async () => {
    await request(app).get('/api/v1/friends').expect(401);
    const incomplete = await member('Incomplete', false);
    const target = await member('Target');
    await request(app).get('/api/v1/friends').auth(incomplete.token, { type: 'bearer' }).expect(403);
    await request(app).post('/api/v1/friends/request').auth(incomplete.token, { type: 'bearer' })
      .send({ targetUserId: target.user.id }).expect(403);
  });

  it('tracks incoming and outgoing requests, accepts only as recipient, and lists accepted friends', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const eve = await member('Eve');

    const created = await request(app).post('/api/v1/friends/request')
      .auth(alice.token, { type: 'bearer' }).send({ targetUserId: bob.user.id }).expect(201);
    const requestId = data<FriendshipData>(created)._id;
    expect(data<FriendshipData>(created).status).toBe('pending');

    await request(app).post('/api/v1/friends/request')
      .auth(alice.token, { type: 'bearer' }).send({ targetUserId: bob.user.id }).expect(409);
    await request(app).post('/api/v1/friends/request')
      .auth(bob.token, { type: 'bearer' }).send({ targetUserId: alice.user.id }).expect(409);

    const incoming = await request(app).get('/api/v1/friends/requests')
      .auth(bob.token, { type: 'bearer' }).expect(200);
    const incomingRequests = data<{ incoming: FriendRequestData[] }>(incoming).incoming;
    expect(incomingRequests).toHaveLength(1);
    expect(incomingRequests[0]?.id).toBe(requestId);
    expect(incomingRequests[0]?.requester.id).toBe(alice.user.id);
    const outgoing = await request(app).get('/api/v1/friends/requests')
      .auth(alice.token, { type: 'bearer' }).expect(200);
    const outgoingRequests = data<{ outgoing: FriendRequestData[] }>(outgoing).outgoing;
    expect(outgoingRequests).toHaveLength(1);
    expect(outgoingRequests[0]?.id).toBe(requestId);
    expect(outgoingRequests[0]?.recipient.id).toBe(bob.user.id);

    await request(app).post('/api/v1/friends/respond')
      .auth(eve.token, { type: 'bearer' }).send({ requestId, action: 'accept' }).expect(403);
    await request(app).post('/api/v1/friends/respond')
      .auth(alice.token, { type: 'bearer' }).send({ requestId, action: 'accept' }).expect(403);
    await request(app).post('/api/v1/friends/respond')
      .auth(bob.token, { type: 'bearer' }).send({ requestId, action: 'accept' }).expect(200);
    await request(app).post('/api/v1/friends/respond')
      .auth(bob.token, { type: 'bearer' }).send({ requestId, action: 'reject' }).expect(409);

    const friends = await request(app).get('/api/v1/friends')
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<(PublicUser & { friendshipId: string })[]>(friends)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: bob.user.id, friendshipId: requestId }),
    ]));
    expect(data<PublicUser[]>(friends)).toHaveLength(1);
    await request(app).post('/api/v1/friends/request')
      .auth(alice.token, { type: 'bearer' }).send({ targetUserId: bob.user.id }).expect(409);

    await request(app).delete(`/api/v1/friends/${requestId}`)
      .auth(eve.token, { type: 'bearer' }).expect(403);
    const removed = await request(app).delete(`/api/v1/friends/${requestId}`)
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<FriendshipData>(removed).status).toBe('rejected');
    const afterRemoval = await request(app).get('/api/v1/friends')
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<PublicUser[]>(afterRemoval)).toEqual([]);
    await request(app).post('/api/v1/friends/request')
      .auth(bob.token, { type: 'bearer' }).send({ targetUserId: alice.user.id }).expect(201);
  });

  it('lets a rejected request be sent again', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const first = await request(app).post('/api/v1/friends/request')
      .auth(alice.token, { type: 'bearer' }).send({ targetUserId: bob.user.id }).expect(201);
    await request(app).post('/api/v1/friends/respond')
      .auth(bob.token, { type: 'bearer' }).send({ requestId: data<FriendshipData>(first)._id, action: 'reject' }).expect(200);
    const again = await request(app).post('/api/v1/friends/request')
      .auth(bob.token, { type: 'bearer' }).send({ targetUserId: alice.user.id }).expect(201);
    expect(data<FriendshipData>(again).status).toBe('pending');
    expect(data<FriendshipData>(again).recipient).toBe(alice.user.id);
  });

  it('lets only the sender cancel a pending request and allows sending again', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const eve = await member('Eve');
    const created = await request(app).post('/api/v1/friends/request')
      .auth(alice.token, { type: 'bearer' }).send({ targetUserId: bob.user.id }).expect(201);
    const requestId = data<FriendshipData>(created)._id;

    await request(app).delete(`/api/v1/friends/requests/${requestId}`)
      .auth(bob.token, { type: 'bearer' }).expect(403);
    await request(app).delete(`/api/v1/friends/requests/${requestId}`)
      .auth(eve.token, { type: 'bearer' }).expect(403);
    await request(app).delete('/api/v1/friends/requests/invalid')
      .auth(alice.token, { type: 'bearer' }).expect(422);
    const cancelled = await request(app).delete(`/api/v1/friends/requests/${requestId}`)
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<FriendshipData>(cancelled).status).toBe('rejected');
    await request(app).delete(`/api/v1/friends/requests/${requestId}`)
      .auth(alice.token, { type: 'bearer' }).expect(409);
    const requests = await request(app).get('/api/v1/friends/requests')
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<{ outgoing: FriendRequestData[] }>(requests).outgoing).toEqual([]);
    await request(app).post('/api/v1/friends/request')
      .auth(alice.token, { type: 'bearer' }).send({ targetUserId: bob.user.id }).expect(201);
  });

  it('ranks active, unconnected suggestions by mutual friends and reports counts across connection views', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const carol = await member('Carol');
    const dan = await member('Dan');
    const erin = await member('Erin');
    const fay = await member('Fay');
    const gina = await member('Gina');
    const inactive = await member('Inactive');
    inactive.user.isActive = false;
    await inactive.user.save();

    await FriendshipModel.create([
      { requester: alice.user.id, recipient: bob.user.id, status: 'accepted' },
      { requester: alice.user.id, recipient: carol.user.id, status: 'accepted' },
      { requester: alice.user.id, recipient: dan.user.id, status: 'accepted' },
      { requester: bob.user.id, recipient: carol.user.id, status: 'accepted' },
      { requester: bob.user.id, recipient: erin.user.id, status: 'accepted' },
      { requester: carol.user.id, recipient: erin.user.id, status: 'accepted' },
      { requester: bob.user.id, recipient: fay.user.id, status: 'accepted' },
      { requester: carol.user.id, recipient: inactive.user.id, status: 'accepted' },
      { requester: alice.user.id, recipient: fay.user.id, status: 'pending' },
    ]);

    const friends = await request(app).get('/api/v1/friends')
      .auth(alice.token, { type: 'bearer' }).expect(200);
    const friendList = data<ConnectionData[]>(friends);
    expect(friendList.find((user) => user.id === bob.user.id)?.mutualFriendCount).toBe(1);
    expect(friendList.find((user) => user.id === dan.user.id)?.mutualFriendCount).toBe(0);

    const suggestions = await request(app).get('/api/v1/friends/suggestions')
      .auth(alice.token, { type: 'bearer' }).expect(200);
    const suggestionsList = data<ConnectionData[]>(suggestions);
    expect(suggestionsList.map((user) => user.id)).toEqual([erin.user.id, gina.user.id]);
    expect(suggestionsList.map((user) => user.mutualFriendCount)).toEqual([2, 0]);
    expect(suggestionsList[0]).toMatchObject({ relationshipStatus: 'none', requestId: null });
    expect(suggestionsList[0]).not.toHaveProperty('email');

    const limited = await request(app).get('/api/v1/friends/suggestions').query({ limit: 1 })
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<ConnectionData[]>(limited).map((user) => user.id)).toEqual([erin.user.id]);
    await request(app).get('/api/v1/friends/suggestions').query({ limit: 51 })
      .auth(alice.token, { type: 'bearer' }).expect(422);
    await request(app).get('/api/v1/friends/suggestions').expect(401);

    const search = await request(app).get('/api/v1/friends/search').query({ q: 'Erin' })
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<ConnectionData[]>(search)[0]?.mutualFriendCount).toBe(2);
    const connection = await request(app).get(`/api/v1/friends/users/${erin.user.id}`)
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<ConnectionData>(connection).mutualFriendCount).toBe(2);
  });

  it('shows relationship state in search and profile without exposing inactive users', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const inactive = await member('Inactive');
    inactive.user.isActive = false;
    await inactive.user.save();

    await request(app).post('/api/v1/friends/request').auth(alice.token, { type: 'bearer' })
      .send({ targetUserId: alice.user.id }).expect(400);
    await request(app).post('/api/v1/friends/request').auth(alice.token, { type: 'bearer' })
      .send({ targetUserId: 'invalid' }).expect(422);
    const sent = await request(app).post('/api/v1/friends/request').auth(alice.token, { type: 'bearer' })
      .send({ targetUserId: bob.user.id }).expect(201);

    const search = await request(app).get('/api/v1/friends/search').query({ q: 'Bob' })
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<PublicUser[]>(search)).toEqual([
      expect.objectContaining({ id: bob.user.id, relationshipStatus: 'pending_sent', requestId: data<FriendshipData>(sent)._id }),
    ]);
    expect(data<PublicUser[]>(search)[0]).not.toHaveProperty('email');
    const profile = await request(app).get(`/api/v1/friends/users/${alice.user.id}`)
      .auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<PublicUser>(profile)).toMatchObject({ id: alice.user.id, relationshipStatus: 'pending_received' });
    const literalRegex = await request(app).get('/api/v1/friends/search').query({ q: '.*' })
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<PublicUser[]>(literalRegex)).toEqual([]);
    const hidden = await request(app).get('/api/v1/friends/search').query({ q: 'Inactive' })
      .auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<PublicUser[]>(hidden)).toEqual([]);
  });
});
