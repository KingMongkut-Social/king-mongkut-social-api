import type { Server as SocketServer } from 'socket.io';

let io: SocketServer | undefined;

export function setChatSocketServer(server: SocketServer | undefined): void {
  io = server;
}

export function isUserOnline(userId: string): boolean {
  return (io?.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0) > 0;
}

export function emitPresenceUpdated(friendIds: string[], userId: string, isOnline: boolean): void {
  for (const friendId of friendIds) {
    io?.to(`user:${friendId}`).emit('presence:updated', { userId, isOnline });
  }
}

export function emitFriendUpdated(friendship: {
  _id: unknown;
  requester: unknown;
  recipient: unknown;
  status: string;
}): void {
  const requesterId = String(friendship.requester);
  const recipientId = String(friendship.recipient);
  const base = { friendshipId: String(friendship._id), status: friendship.status };
  io?.to(`user:${requesterId}`).emit('friend:updated', { ...base, userId: recipientId });
  io?.to(`user:${recipientId}`).emit('friend:updated', { ...base, userId: requesterId });
}

export function emitChatUpdated<T extends { members: { id: string }[] }>(chat: T): void {
  for (const member of chat.members) {
    io?.to(`user:${member.id}`).emit('conversation:updated', chat);
  }
}

export function emitMessageNew(
  members: string[],
  message: { id: string; chatId: string; senderId: string; content: string; createdAt: Date },
): void {
  for (const memberId of members) {
    io?.to(`user:${memberId}`).emit('message:new', message);
  }
}
