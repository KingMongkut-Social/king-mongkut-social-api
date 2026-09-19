import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import type { ReactionBody, ReactionTargetParams } from './reaction.schemas.js';
import * as reactionService from './reaction.service.js';

export async function set(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const params = req.params as unknown as ReactionTargetParams;
  const body = req.body as ReactionBody;
  const engagement = await reactionService.setReaction(
    req.auth.userId,
    params.targetType,
    params.targetId,
    body.type,
  );
  res.json({ success: true, data: { engagement } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const params = req.params as unknown as ReactionTargetParams;
  const engagement = await reactionService.removeReaction(
    req.auth.userId,
    params.targetType,
    params.targetId,
  );
  res.json({ success: true, data: { engagement } });
}
