import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import type {
  RespondFriendRequestInput,
  SearchUsersQueryInput,
  SendFriendRequestInput,
} from './friendship.schemas.js';
import * as friendService from './friendship.service.js';

export async function searchUsers(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = req.query as unknown as SearchUsersQueryInput;
  const results = await friendService.searchUsers(req.auth.userId, query);
  res.json({ success: true, data: results });
}

export async function sendRequest(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const body = req.body as unknown as SendFriendRequestInput;
  const friendship = await friendService.sendFriendRequest(req.auth.userId, body.targetUserId);
  res.status(201).json({ success: true, data: friendship });
}

export async function respondRequest(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const body = req.body as unknown as RespondFriendRequestInput;
  const result = await friendService.respondFriendRequest(req.auth.userId, body.requestId, body.action);
  res.json({ success: true, data: result });
}
