import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateCommentInput, UpdateCommentInput } from './comment.schemas.js';
import * as commentService from './comment.service.js';

interface PostParams {
  postId: string;
}

interface CommentParams extends PostParams {
  commentId: string;
}

export async function list(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as PostParams;
  const items = await commentService.listComments(params.postId, req.auth);
  res.json({ success: true, data: { items } });
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const params = req.params as unknown as PostParams;
  const input = req.body as unknown as CreateCommentInput;
  const comment = await commentService.createComment(
    params.postId,
    req.auth.userId,
    req.auth.role,
    input,
  );
  res.status(201).json({ success: true, data: { comment } });
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const params = req.params as unknown as CommentParams;
  const input = req.body as unknown as UpdateCommentInput;
  await commentService.updateComment(
    params.postId,
    params.commentId,
    req.auth.userId,
    req.auth.role,
    input,
  );
  res.status(204).send();
}

export async function remove(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const params = req.params as unknown as CommentParams;
  await commentService.deleteComment(
    params.postId,
    params.commentId,
    req.auth.userId,
    req.auth.role,
  );
  res.status(204).send();
}
