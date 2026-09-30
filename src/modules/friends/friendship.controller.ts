import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import * as friendService from './friendship.service.js';
import { emitFriendUpdated } from '../chats/chat.realtime.js';

export async function listFriends(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({ success: true, data: await friendService.listFriends(req.auth.userId) });
}

export async function listRequests(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({ success: true, data: await friendService.listFriendRequests(req.auth.userId) });
}

export async function listSuggestions(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({ success: true, data: await friendService.suggestFriends(req.auth.userId, Number(req.query.limit ?? 20)) });
}

export async function getUserConnection(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({ success: true, data: await friendService.getUserConnection(req.auth.userId, String(req.params.userId)) });
}

export async function searchUsers(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { q, university, limit } = req.query;

  const results = await friendService.searchUsers(req.auth.userId, {
    q: typeof q === 'string' ? q : undefined,
    university: university === 'KMITL' || university === 'KMUTNB' || university === 'KMUTT' ? university : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  res.json({ success: true, data: results });
}

export async function sendRequest(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { targetUserId } = req.body as { targetUserId: string };

  const friendship = await friendService.sendFriendRequest(req.auth.userId, targetUserId);
  emitFriendUpdated(friendship);
  res.status(201).json({ success: true, data: friendship });
}

export async function respondRequest(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { requestId, action } = req.body as { requestId: string; action: 'accept' | 'reject' };

  const result = await friendService.respondFriendRequest(req.auth.userId, requestId, action);
  emitFriendUpdated(result);
  res.json({ success: true, data: result });
}

export async function cancelRequest(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const result = await friendService.cancelFriendRequest(req.auth.userId, String(req.params.requestId));
  emitFriendUpdated(result);
  res.json({ success: true, data: result });
}


export async function removeFriend(req: Request, res: Response) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const result = await friendService.removeFriend(req.auth.userId, String(req.params.requestId));
  emitFriendUpdated(result);
  res.json({ success: true, data: result });
}
