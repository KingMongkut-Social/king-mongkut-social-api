import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import * as service from './notification.service.js';

function userId(req: Request): string {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.userId;
}

export async function list(req: Request, res: Response) {
  res.json({
    success: true,
    data: await service.listNotifications(
      userId(req),
      Number(req.query.page ?? 1),
      Number(req.query.limit ?? 20),
      req.query.unreadOnly === '1',
    ),
  });
}

export async function read(req: Request, res: Response) {
  res.json({ success: true, data: { notification: await service.markRead(userId(req), String(req.params.id)) } });
}

export async function readAll(req: Request, res: Response) {
  res.json({ success: true, data: await service.markAllRead(userId(req)) });
}
