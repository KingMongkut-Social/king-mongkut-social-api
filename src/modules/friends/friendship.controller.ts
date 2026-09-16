import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import * as friendService from './friendship.service.js';

export async function searchUsers(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { q, university, limit } = req.query;

  const results = await friendService.searchUsers(req.auth.userId, {
    q: typeof q === 'string' ? q : undefined,
    university: typeof university === 'string' ? (university as any) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  res.json({ success: true, data: results });
}

export async function sendRequest(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { targetUserId } = req.body;

  const friendship = await friendService.sendFriendRequest(req.auth.userId, targetUserId);
  res.status(201).json({ success: true, data: friendship });
}

export async function respondRequest(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { requestId, action } = req.body;

  const result = await friendService.respondFriendRequest(req.auth.userId, requestId, action);
  res.json({ success: true, data: result });
}