import { AppError } from '../../common/errors/app-error.js';
import { emitToUser } from '../chats/chat.realtime.js';
import { UserModel } from '../users/user.model.js';
import { NotificationModel, type NotificationType } from './notification.model.js';

type NotificationView = {
  _id: unknown;
  recipient: unknown;
  actor: unknown;
  type: NotificationType;
  entityId?: string | null;
  content?: string | null;
  readAt?: Date | null;
  createdAt: Date;
};

function serialize(item: NotificationView) {
  const actor = item.actor && typeof item.actor === 'object'
    ? item.actor as { _id?: unknown; name?: string; avatarUrl?: string | null; university?: string }
    : null;
  return {
    id: String(item._id),
    recipientId: String(item.recipient),
    actor: actor?._id ? {
      id: String(actor._id),
      name: actor.name ?? 'ผู้ใช้',
      avatarUrl: actor.avatarUrl ?? null,
      university: actor.university ?? '',
    } : null,
    type: item.type,
    entityId: item.entityId ?? null,
    content: item.content ?? null,
    read: Boolean(item.readAt),
    readAt: item.readAt ?? null,
    createdAt: item.createdAt,
  };
}

export async function createNotification(input: {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityId?: string;
  content?: string;
}) {
  if (input.recipientId === input.actorId) return null;
  const [recipient, actor] = await Promise.all([
    UserModel.exists({ _id: input.recipientId, isActive: true }),
    UserModel.exists({ _id: input.actorId, isActive: true }),
  ]);
  if (!recipient || !actor) return null;

  const item = await NotificationModel.create({
    recipient: input.recipientId,
    actor: input.actorId,
    type: input.type,
    entityId: input.entityId ?? null,
    content: input.content ?? null,
  });
  const populated = await NotificationModel.findById(item._id)
    .populate('actor', 'name avatarUrl university').lean();
  if (!populated) return null;

  const payload = serialize(populated as unknown as NotificationView);
  emitToUser(input.recipientId, 'notification:new', payload);
  return payload;
}

export async function listNotifications(userId: string, page: number, limit: number, unreadOnly = false) {
  const filter = { recipient: userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    NotificationModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('actor', 'name avatarUrl university').lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ recipient: userId, readAt: null }),
  ]);
  return {
    items: items.map((item) => serialize(item as unknown as NotificationView)),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    unreadCount,
  };
}

export async function markRead(userId: string, notificationId: string) {
  const item = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { readAt: new Date() } },
    { returnDocument: 'after' },
  ).populate('actor', 'name avatarUrl university').lean();
  if (!item) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
  const payload = serialize(item as unknown as NotificationView);
  emitToUser(userId, 'notification:read', { id: notificationId });
  return payload;
}

export async function markAllRead(userId: string) {
  const readAt = new Date();
  await NotificationModel.updateMany({ recipient: userId, readAt: null }, { $set: { readAt } });
  emitToUser(userId, 'notification:read-all', { readAt });
  return { readAt };
}
