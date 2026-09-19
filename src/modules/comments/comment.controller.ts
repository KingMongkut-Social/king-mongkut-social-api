import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateCommentInput, UpdateCommentInput } from './comment.schemas.js';
import * as commentService from './comment.service.js';

export async function list(req: Request, res: Response): Promise<void> {
  const items = await commentService.listComments(req.params.postId as string, req.auth);
  res.json({ success: true, data: { items } });
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const comment = await commentService.createComment(
    req.params.postId as string,
    req.auth.userId,
    req.auth.role,
    req.body as CreateCommentInput,
  );
  res.status(201).json({ success: true, data: { comment } });
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  await commentService.updateComment(
    req.params.postId as string,
    req.params.commentId as string,
    req.auth.userId,
    req.auth.role,
    req.body as UpdateCommentInput,
  );
  res.status(204).send();
}

export async function remove(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  await commentService.deleteComment(
    req.params.postId as string,
    req.params.commentId as string,
    req.auth.userId,
    req.auth.role,
  );
  res.status(204).send();
}
