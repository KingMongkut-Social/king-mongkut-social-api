import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';
import request, { type Response as TestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/modules/auth/token.service.js';
import { FriendshipModel } from '../src/modules/friends/friendship.model.js';
import { attachChatSocket } from '../src/modules/chats/chat.socket.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { ChatUploadModel } from '../src/modules/chats/chat-upload.model.js';

const server = createServer(createApp());
let socketServer: ReturnType<typeof attachChatSocket>;
let database: MongoMemoryServer;
let baseUrl: string;
let clients: ClientSocket[] = [];

type PublicUser = { id: string; name: string };
type ChatData = { id: string; type: 'direct' | 'group'; name: string | null; members: PublicUser[] };
type MessageData = { id: string; chatId: string; senderId: string; content: string; images: string[] };

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

async function makeFriends(first: Awaited<ReturnType<typeof member>>, second: Awaited<ReturnType<typeof member>>) {
  await FriendshipModel.create({ requester: first.user._id, recipient: second.user._id, status: 'accepted' });
}

async function socketClient(token?: string): Promise<ClientSocket> {
  const client = connectSocket(baseUrl, {
    transports: ['websocket'],
    auth: token ? { token } : {},
    reconnection: false,
    forceNew: true,
  });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 5_000);
    client.once('connect', () => { clearTimeout(timeout); resolve(); });
    client.once('connect_error', (error) => { clearTimeout(timeout); reject(error); });
  });
  return client;
}

function nextMessage(client: ClientSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for message:new')), 5_000);
    client.once('message:new', (message: Record<string, unknown>) => {
      clearTimeout(timeout);
      resolve(message);
    });
  });
}

function nextFriendUpdate(client: ClientSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for friend:updated')), 5_000);
    client.once('friend:updated', (update: Record<string, unknown>) => {
      clearTimeout(timeout);
      resolve(update);
    });
  });
}

function nextPresenceUpdate(client: ClientSocket): Promise<{ userId: string; isOnline: boolean }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for presence:updated')), 5_000);
    client.once('presence:updated', (update: { userId: string; isOnline: boolean }) => {
      clearTimeout(timeout);
      resolve(update);
    });
  });
}

function nextConversationUpdate(client: ClientSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for conversation:updated')), 5_000);
    client.once('conversation:updated', (update: Record<string, unknown>) => {
      clearTimeout(timeout);
      resolve(update);
    });
  });
}

beforeAll(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  await Promise.all([UserModel.syncIndexes(), FriendshipModel.syncIndexes()]);
  socketServer = attachChatSocket(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

beforeEach(async () => {
  clients.forEach((client) => client.disconnect());
  clients = [];
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  clients.forEach((client) => client.disconnect());
  if (socketServer) await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  else if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await database?.stop();
});

describe('conversation REST API', () => {
  it('opens one direct conversation only after friendship acceptance', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const eve = await member('Eve');

    await request(server).post('/api/v1/chats/direct').auth(alice.token, { type: 'bearer' })
      .send({ userId: bob.user.id }).expect(403);
    await makeFriends(alice, bob);
    const created = await request(server).post('/api/v1/chats/direct').auth(alice.token, { type: 'bearer' })
      .send({ userId: bob.user.id }).expect(201);
    expect(data<ChatData>(created)).toMatchObject({ type: 'direct', name: null });
    expect(data<ChatData>(created).members.map((user) => user.id).sort())
      .toEqual([alice.user.id, bob.user.id].sort());

    const reopened = await request(server).post('/api/v1/chats/direct').auth(bob.token, { type: 'bearer' })
      .send({ userId: alice.user.id }).expect(200);
    expect(data<ChatData>(reopened).id).toBe(data<ChatData>(created).id);
    const list = await request(server).get('/api/v1/chats').auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<ChatData[]>(list)).toEqual(expect.arrayContaining([expect.objectContaining({ id: data<ChatData>(created).id })]));
    const outsider = await request(server).get('/api/v1/chats').auth(eve.token, { type: 'bearer' }).expect(200);
    expect(data<ChatData[]>(outsider)).toEqual([]);
  });

  it('uploads chat images and supports image-only messages', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    await makeFriends(alice, bob);

    const created = await request(server).post('/api/v1/chats/direct')
      .auth(alice.token, { type: 'bearer' })
      .send({ userId: bob.user.id })
      .expect(201);
    const chatId = data<ChatData>(created).id;

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const uploaded = await request(server).post('/api/v1/chats/uploads')
      .auth(alice.token, { type: 'bearer' })
      .attach('file', png, { filename: 'chat.png', contentType: 'image/png' })
      .expect(201);
    const imageUrl = data<{ image: { url: string; mimeType: string; size: number } }>(uploaded).image.url;
    expect(imageUrl).toMatch(/^\/api\/v1\/chats\/uploads\/[a-f0-9-]{36}\.png$/);

    await request(server).get(imageUrl).expect(401);
    await request(server).get(imageUrl).auth(alice.token, { type: 'bearer' }).expect(200).expect('Content-Type', /image\/png/);
    await request(server).get(imageUrl).auth(bob.token, { type: 'bearer' }).expect(404);
    await request(server).post(`/api/v1/chats/${chatId}/messages`)
      .auth(bob.token, { type: 'bearer' }).send({ images: [imageUrl] }).expect(404);

    const sent = await request(server).post(`/api/v1/chats/${chatId}/messages`)
      .auth(alice.token, { type: 'bearer' })
      .send({ content: '', images: [imageUrl] })
      .expect(201);
    expect(data<MessageData>(sent)).toMatchObject({ chatId, content: '', images: [imageUrl] });
    await request(server).get(imageUrl).auth(bob.token, { type: 'bearer' }).expect(200);
    // Images sent before upload ownership records existed remain readable to members.
    await ChatUploadModel.deleteOne({ url: imageUrl });
    await request(server).get(imageUrl).auth(bob.token, { type: 'bearer' }).expect(200);
    const eve = await member('Eve');
    await request(server).get(imageUrl).auth(eve.token, { type: 'bearer' }).expect(404);

    const history = await request(server).get(`/api/v1/chats/${chatId}/messages`)
      .auth(bob.token, { type: 'bearer' })
      .expect(200);
    expect(data<MessageData[]>(history)[0]).toMatchObject({ images: [imageUrl] });

    await request(server).post(`/api/v1/chats/${chatId}/messages`)
      .auth(alice.token, { type: 'bearer' })
      .send({ content: '', images: ['https://example.com/not-allowed.png'] })
      .expect(422);

    await request(server).post(`/api/v1/chats/${chatId}/messages`)
      .auth(alice.token, { type: 'bearer' })
      .send({ content: '', images: [] })
      .expect(422);
  });

  it('restricts group creation and message history to accepted friends and members', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const charlie = await member('Charlie');
    const eve = await member('Eve');
    await makeFriends(alice, bob);
    await makeFriends(alice, charlie);

    await request(server).post('/api/v1/chats/groups').auth(alice.token, { type: 'bearer' })
      .send({ name: 'Project', memberIds: [bob.user.id, eve.user.id] }).expect(403);
    const created = await request(server).post('/api/v1/chats/groups').auth(alice.token, { type: 'bearer' })
      .send({ name: 'Project', memberIds: [bob.user.id, charlie.user.id] }).expect(201);
    const chatId = data<ChatData>(created).id;
    expect(data<ChatData>(created)).toMatchObject({ type: 'group', name: 'Project' });
    expect(data<ChatData>(created).members).toHaveLength(3);

    const contents = ['First', 'Second', 'Third'];
    const messages: MessageData[] = [];
    for (const content of contents) {
      const sent = await request(server).post(`/api/v1/chats/${chatId}/messages`)
        .auth(bob.token, { type: 'bearer' }).send({ content }).expect(201);
      messages.push(data<MessageData>(sent));
    }
    const firstPage = await request(server).get(`/api/v1/chats/${chatId}/messages`)
      .query({ limit: 2 }).auth(charlie.token, { type: 'bearer' }).expect(200);
    expect(data<MessageData[]>(firstPage).map((message) => message.id))
      .toEqual([messages[2]!.id, messages[1]!.id]);
    const older = await request(server).get(`/api/v1/chats/${chatId}/messages`)
      .query({ before: messages[1]!.id, limit: 2 }).auth(charlie.token, { type: 'bearer' }).expect(200);
    expect(data<MessageData[]>(older).map((message) => message.id)).toEqual([messages[0]!.id]);

    await request(server).get(`/api/v1/chats/${chatId}/messages`)
      .auth(eve.token, { type: 'bearer' }).expect(403);
    await request(server).post(`/api/v1/chats/${chatId}/messages`)
      .auth(eve.token, { type: 'bearer' }).send({ content: 'Intrusion' }).expect(403);
    await request(server).post(`/api/v1/chats/${chatId}/messages`)
      .send({ content: 'Anonymous' }).expect(401);
  });
});

describe('Socket.IO delivery', () => {
  it('rejects sockets without an access token or a complete profile', async () => {
    const incomplete = await member('Incomplete', false);
    await expect(socketClient()).rejects.toThrow();
    await expect(socketClient(incomplete.token)).rejects.toThrow();
  });

  it('shows real presence only for accepted friends and handles multiple tabs', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const eve = await member('Eve');
    await makeFriends(alice, bob);
    await FriendshipModel.create({ requester: alice.user._id, recipient: eve.user._id, status: 'pending' });

    const aliceSocket = await socketClient(alice.token);
    const eveSocket = await socketClient(eve.token);
    const outsiderPresence = vi.fn();
    eveSocket.on('presence:updated', outsiderPresence);
    const before = await request(server).get('/api/v1/friends').auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<{ id: string; isOnline: boolean }[]>(before)).toEqual([
      expect.objectContaining({ id: bob.user.id, isOnline: false }),
    ]);

    const online = nextPresenceUpdate(aliceSocket);
    const bobSocket = await socketClient(bob.token);
    expect(await online).toEqual({ userId: bob.user.id, isOnline: true });
    const during = await request(server).get('/api/v1/friends').auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<{ id: string; isOnline: boolean }[]>(during)).toEqual([
      expect.objectContaining({ id: bob.user.id, isOnline: true }),
    ]);

    const secondBobSocket = await socketClient(bob.token);
    const duplicatePresence = vi.fn();
    aliceSocket.on('presence:updated', duplicatePresence);
    bobSocket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(duplicatePresence).not.toHaveBeenCalled();

    const offline = nextPresenceUpdate(aliceSocket);
    secondBobSocket.disconnect();
    expect(await offline).toEqual({ userId: bob.user.id, isOnline: false });
    const after = await request(server).get('/api/v1/friends').auth(alice.token, { type: 'bearer' }).expect(200);
    expect(data<{ id: string; isOnline: boolean }[]>(after)).toEqual([
      expect.objectContaining({ id: bob.user.id, isOnline: false }),
    ]);
    expect(outsiderPresence).not.toHaveBeenCalled();
  });

  it('notifies both users when a friend request is sent and accepted', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const aliceSocket = await socketClient(alice.token);
    const bobSocket = await socketClient(bob.token);

    const alicePending = nextFriendUpdate(aliceSocket);
    const bobPending = nextFriendUpdate(bobSocket);
    const sent = await request(server).post('/api/v1/friends/request')
      .auth(alice.token, { type: 'bearer' }).send({ targetUserId: bob.user.id }).expect(201);
    const requestId = data<{ _id: string }>(sent)._id;
    expect(await alicePending).toMatchObject({ userId: bob.user.id, friendshipId: requestId, status: 'pending' });
    expect(await bobPending).toMatchObject({ userId: alice.user.id, friendshipId: requestId, status: 'pending' });

    const aliceAccepted = nextFriendUpdate(aliceSocket);
    const bobAccepted = nextFriendUpdate(bobSocket);
    await request(server).post('/api/v1/friends/respond')
      .auth(bob.token, { type: 'bearer' }).send({ requestId, action: 'accept' }).expect(200);
    expect(await aliceAccepted).toMatchObject({ friendshipId: requestId, status: 'accepted' });
    expect(await bobAccepted).toMatchObject({ friendshipId: requestId, status: 'accepted' });
  });

  it('broadcasts messages only to current conversation members and verifies socket sends', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    const eve = await member('Eve');
    await makeFriends(alice, bob);
    const chat = await request(server).post('/api/v1/chats/direct')
      .auth(alice.token, { type: 'bearer' }).send({ userId: bob.user.id }).expect(201);
    const chatId = data<ChatData>(chat).id;

    const aliceSocket = await socketClient(alice.token);
    const bobSocket = await socketClient(bob.token);
    const eveSocket = await socketClient(eve.token);
    const outsiderReceived = vi.fn();
    eveSocket.on('message:new', outsiderReceived);

    const aliceReceived = nextMessage(aliceSocket);
    const bobReceived = nextMessage(bobSocket);
    const aliceUpdated = nextConversationUpdate(aliceSocket);
    const bobUpdated = nextConversationUpdate(bobSocket);
    const sent = await request(server).post(`/api/v1/chats/${chatId}/messages`)
      .auth(alice.token, { type: 'bearer' }).send({ content: 'Hello Bob' }).expect(201);
    expect(await aliceReceived).toMatchObject({ id: data<MessageData>(sent).id, chatId, content: 'Hello Bob' });
    expect(await bobReceived).toMatchObject({ id: data<MessageData>(sent).id, chatId, content: 'Hello Bob' });
    expect(await aliceUpdated).toMatchObject({ id: chatId, lastMessage: { id: data<MessageData>(sent).id } });
    expect(await bobUpdated).toMatchObject({ id: chatId, lastMessage: { id: data<MessageData>(sent).id } });

    const fromBob = nextMessage(aliceSocket);
    const ack = await new Promise<Record<string, unknown>>((resolve) => {
      bobSocket.emit('chat:send', { chatId, content: 'Hi Alice' }, resolve);
    });
    expect(ack).toMatchObject({ success: true, data: { chatId, content: 'Hi Alice' } });
    expect(await fromBob).toMatchObject({ chatId, content: 'Hi Alice', senderId: bob.user.id });

    const refused = await new Promise<Record<string, unknown>>((resolve) => {
      eveSocket.emit('chat:send', { chatId, content: 'Intrusion' }, resolve);
    });
    expect(refused).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outsiderReceived).not.toHaveBeenCalled();
  });

  it('broadcasts image message metadata over Socket.IO', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    await makeFriends(alice, bob);
    const chat = await request(server).post('/api/v1/chats/direct')
      .auth(alice.token, { type: 'bearer' }).send({ userId: bob.user.id }).expect(201);
    const chatId = data<ChatData>(chat).id;
    const imageUrl = '/api/v1/chats/uploads/11111111-1111-4111-8111-111111111111.png';
    await ChatUploadModel.create({ url: imageUrl, owner: alice.user._id });

    const aliceSocket = await socketClient(alice.token);
    const bobSocket = await socketClient(bob.token);
    const received = nextMessage(bobSocket);
    const ack = await new Promise<Record<string, unknown>>((resolve) => {
      aliceSocket.emit('chat:send', { chatId, content: 'รูปนี้', images: [imageUrl] }, resolve);
    });

    expect(ack).toMatchObject({
      success: true,
      data: { chatId, content: 'รูปนี้', images: [imageUrl] },
    });
    expect(await received).toMatchObject({
      chatId,
      senderId: alice.user.id,
      content: 'รูปนี้',
      images: [imageUrl],
    });
  });

  it('stops a connected account from sending after deactivation', async () => {
    const alice = await member('Alice');
    const bob = await member('Bob');
    await makeFriends(alice, bob);
    const chat = await request(server).post('/api/v1/chats/direct')
      .auth(alice.token, { type: 'bearer' }).send({ userId: bob.user.id }).expect(201);
    const chatId = data<ChatData>(chat).id;
    const aliceSocket = await socketClient(alice.token);

    alice.user.isActive = false;
    await alice.user.save();
    const refused = await new Promise<Record<string, unknown>>((resolve) => {
      aliceSocket.emit('chat:send', { chatId, content: 'Should not persist' }, resolve);
    });
    expect(refused).toMatchObject({ success: false, error: { code: 'ACCOUNT_INACTIVE' } });
    const history = await request(server).get(`/api/v1/chats/${chatId}/messages`)
      .auth(bob.token, { type: 'bearer' }).expect(200);
    expect(data<MessageData[]>(history)).toEqual([]);
    await expect(socketClient(alice.token)).rejects.toThrow();
  });
});
