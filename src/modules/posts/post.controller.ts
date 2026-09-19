import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import type { CreatePostInput, ListPostsQuery, UpdatePostInput } from './post.schemas.js';
import * as postService from './post.service.js';

interface PostIdParams {
  id: string;
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const input = req.body as unknown as CreatePostInput;
  const post = await postService.createPost(req.auth.userId, input);
  res.status(201).json({ success: true, data: { post } });
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListPostsQuery;
  const result = await postService.listPublished(query, req.auth?.userId);
  res.json({ success: true, data: result });
}

export async function mine(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = req.query as unknown as ListPostsQuery;
  const result = await postService.listMine(req.auth.userId, query);
  res.json({ success: true, data: result });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as PostIdParams;
  const post = await postService.getPost(params.id, req.auth);
  res.json({ success: true, data: { post } });
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const params = req.params as unknown as PostIdParams;
  const input = req.body as unknown as UpdatePostInput;
  const post = await postService.updatePost(
    params.id,
    req.auth.userId,
    req.auth.role,
    input,
  );
  res.json({ success: true, data: { post } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const params = req.params as unknown as PostIdParams;
  await postService.deletePost(params.id, req.auth.userId, req.auth.role);
  res.status(204).send();
}
