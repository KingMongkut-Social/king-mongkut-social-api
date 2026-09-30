import { Types } from 'mongoose';
import { AppError } from '../../common/errors/app-error.js';
import { FriendshipModel } from '../friends/friendship.model.js';
import { UserModel } from '../users/user.model.js';
import { ChatMessageModel } from './chat-message.model.js';
import { ChatModel } from './chat.model.js';
import { emitChatUpdated, emitMessageNew, emitTyping } from './chat.realtime.js';

type ChatRecord = {
  _id: Types.ObjectId;
  type: 'direct' | 'group';
  name: string | null;
  members: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRecord = {
  _id: Types.ObjectId;
  chat: Types.ObjectId;
  sender: Types.ObjectId;
  content: string;
  createdAt: Date;
};

function serializeMessage(message: MessageRecord) {
  return {
    id: String(message._id),
    chatId: String(message.chat),
    senderId: String(message.sender),
    content: message.content,
    createdAt: message.createdAt,
  };
}

async function serializeChats(chats: ChatRecord[]) {
  if (chats.length === 0) return [];
  const userIds = [...new Set(chats.flatMap((chat) => chat.members.map(String)))];
  const messageIds = chats.flatMap((chat) => chat.lastMessage ? [chat.lastMessage] : []);
  const [users, messages] = await Promise.all([
    UserModel.find({ _id: { $in: userIds } }).select('name username avatarUrl university faculty department').lean(),
    ChatMessageModel.find({ _id: { $in: messageIds } }).lean(),
  ]);
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const messageById = new Map(messages.map((message) => [String(message._id), message]));
  return chats.map((chat) => ({
    id: String(chat._id),
    type: chat.type,
    name: chat.name,
    members: chat.members.flatMap((id) => {
      const user = userById.get(String(id));
      return user ? [{
        id: String(user._id),
        name: user.name,
        username: user.username ?? null,
        avatarUrl: user.avatarUrl ?? null,
        university: user.university,
        faculty: user.faculty,
        department: user.department,
      }] : [];
    }),
    lastMessage: chat.lastMessage && messageById.has(String(chat.lastMessage))
      ? serializeMessage(messageById.get(String(chat.lastMessage))!) : null,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  }));
}

async function serializeChat(chat: ChatRecord) {
  const [serialized] = await serializeChats([chat]);
  return serialized!;
}

function directKey(firstId: string, secondId: string): string {
  return [firstId.toLowerCase(), secondId.toLowerCase()].sort().join(':');
}

async function ensureFriendship(userId: string, otherId: string): Promise<void> {
  const accepted = await FriendshipModel.exists({
    status: 'accepted',
    $or: [
      { requester: userId, recipient: otherId },
      { requester: otherId, recipient: userId },
    ],
  });
  if (!accepted) throw new AppError(403, 'FRIENDS_ONLY', 'You can chat only with friends');
}

export async function listChats(userId: string) {
  const chats = await ChatModel.find({ members: userId }).sort({ updatedAt: -1, _id: -1 }).lean();
  return serializeChats(chats);
}

export async function createDirectChat(userId: string, otherId: string) {
  if (userId === otherId) throw new AppError(400, 'BAD_REQUEST', 'Cannot start a direct chat with yourself');
  if (!await UserModel.exists({ _id: otherId, isActive: true })) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Target user not found');
  }
  await ensureFriendship(userId, otherId);
  const key = directKey(userId, otherId);
  const existing = await ChatModel.findOne({ type: 'direct', directKey: key }).lean();
  if (existing) return { chat: await serializeChat(existing), created: false };
  try {
    const chat = await ChatModel.create({
      type: 'direct',
      name: null,
      members: [new Types.ObjectId(userId), new Types.ObjectId(otherId)],
      directKey: key,
    });
    const serialized = await serializeChat(chat.toObject());
    emitChatUpdated(serialized);
    return { chat: serialized, created: true };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      const winner = await ChatModel.findOne({ type: 'direct', directKey: key }).lean();
      if (winner) return { chat: await serializeChat(winner), created: false };
    }
    throw error;
  }
}

export async function createGroupChat(userId: string, name: string, memberIds: string[]) {
  const normalizedIds = memberIds.map((id) => id.toLowerCase());
  if (normalizedIds.includes(userId.toLowerCase())) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Do not include yourself in memberIds');
  }
  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Members must be unique');
  }
  const [users, friendships] = await Promise.all([
    UserModel.find({ _id: { $in: normalizedIds }, isActive: true }).select('_id').lean(),
    FriendshipModel.find({
      status: 'accepted',
      $or: [
        { requester: userId, recipient: { $in: normalizedIds } },
        { recipient: userId, requester: { $in: normalizedIds } },
      ],
    }).select('requester recipient').lean(),
  ]);
  if (users.length !== normalizedIds.length) throw new AppError(404, 'USER_NOT_FOUND', 'A selected user was not found');
  const friendIds = new Set(friendships.map((friendship) =>
    String(friendship.requester) === userId ? String(friendship.recipient) : String(friendship.requester)));
  if (normalizedIds.some((id) => !friendIds.has(id))) {
    throw new AppError(403, 'FRIENDS_ONLY', 'Group members must be your friends');
  }
  const chat = await ChatModel.create({
    type: 'group',
    name,
    members: [new Types.ObjectId(userId), ...normalizedIds.map((id) => new Types.ObjectId(id))],
  });
  const serialized = await serializeChat(chat.toObject());
  emitChatUpdated(serialized);
  return serialized;
}

async function getMemberChat(userId: string, chatId: string) {
  const chat = await ChatModel.findById(chatId).lean();
  if (!chat) throw new AppError(404, 'CHAT_NOT_FOUND', 'Chat not found');
  if (!chat.members.some((member) => String(member) === userId)) {
    throw new AppError(403, 'FORBIDDEN', 'You are not a member of this chat');
  }
  return chat;
}

export async function listMessages(userId: string, chatId: string, limit: number, before?: string) {
  await getMemberChat(userId, chatId);
  const filter: Record<string, unknown> = { chat: chatId };
  if (before) {
    const cursor = await ChatMessageModel.findOne({ _id: before, chat: chatId }).lean();
    if (!cursor) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message cursor not found in this chat');
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
    ];
  }
  const messages = await ChatMessageModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  return messages.map(serializeMessage);
}

export async function sendMessage(userId: string, chatId: string, content: string) {
  const chat = await getMemberChat(userId, chatId);
  const message = await ChatMessageModel.create({
    chat: new Types.ObjectId(chatId),
    sender: new Types.ObjectId(userId),
    content,
  });
  await ChatModel.updateOne(
    {
      _id: chat._id,
      $or: [
        { lastMessageAt: { $exists: false } },
        { lastMessageAt: { $lt: message.createdAt } },
        { lastMessageAt: message.createdAt, lastMessage: { $lt: message._id } },
      ],
    },
    { $set: { lastMessage: message._id, lastMessageAt: message.createdAt, updatedAt: message.createdAt } },
    { timestamps: false },
  );
  const updated = await ChatModel.findById(chat._id).lean();
  if (!updated) throw new AppError(404, 'CHAT_NOT_FOUND', 'Chat not found');
  const serializedMessage = serializeMessage(message.toObject());
  const serializedChat = await serializeChat(updated);
  emitMessageNew(chat.members.map(String), serializedMessage);
  emitChatUpdated(serializedChat);
  return serializedMessage;
}

export async function handleTyping(userId: string, chatId: string, isTyping: boolean): Promise<void> {
  const chat = await ChatModel.findById(chatId).select('members').lean();
  if (!chat) return;
  const isMember = chat.members.some((m) => String(m) === userId);
  if (!isMember) return;
  emitTyping(chat.members.map(String), chatId, userId, isTyping);
}
