import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateCommentInput, CreatePostInput, ListCommentsQuery, ListPostsQuery, ListReactionsQuery, UpdatePostInput } from './post.schemas.js';
import * as postService from './post.service.js';

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const post = await postService.createPost(req.auth.userId, req.body as CreatePostInput);
  res.status(201).json({ success: true, data: { post } });
}

export async function list(req: Request, res: Response): Promise<void> {
  const result = await postService.listPublished(req.query as unknown as ListPostsQuery, req.auth?.userId);
  res.json({ success: true, data: result });
}

export async function bookmarks(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const result = await postService.listBookmarks(req.auth.userId, req.query as unknown as ListPostsQuery);
  res.json({ success: true, data: result });
}

export async function mine(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const result = await postService.listMine(req.auth.userId, req.query as unknown as ListPostsQuery);
  res.json({ success: true, data: result });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const post = await postService.getPost(req.params.id as string, req.auth);
  res.json({ success: true, data: { post } });
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const post = await postService.updatePost(req.params.id as string, req.auth.userId, req.auth.role, req.body as UpdatePostInput);
  res.json({ success: true, data: { post } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  await postService.deletePost(req.params.id as string, req.auth.userId, req.auth.role);
  res.status(204).send();
}

export async function like(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const post = await postService.setLike(req.params.id as string, req.auth.userId, req.method === 'PUT', req.auth.role);
  res.json({ success: true, data: { post } });
}

export async function reaction(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const value = req.method === 'DELETE'
    ? null
    : (req.body as { reaction: 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY' }).reaction;
  const post = await postService.setReaction(req.params.id as string, req.auth.userId, value, req.auth.role);
  res.json({ success: true, data: { post } });
}

export async function bookmark(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const post = await postService.setBookmark(req.params.id as string, req.auth.userId, req.method === 'PUT', req.auth.role);
  res.json({ success: true, data: { post } });
}

export async function comments(req: Request, res: Response): Promise<void> {
  const result = await postService.listComments(req.params.id as string, req.query as unknown as ListCommentsQuery, req.auth);
  res.json({ success: true, data: result });
}

export async function reactions(req: Request, res: Response): Promise<void> {
  const result = await postService.listReactions(req.params.id as string, req.query as unknown as ListReactionsQuery, req.auth);
  res.json({ success: true, data: result });
}

export async function comment(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const result = await postService.addComment(req.params.id as string, req.auth.userId, req.body as CreateCommentInput);
  res.status(201).json({ success: true, data: { comment: result } });
}

export async function removeComment(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  await postService.deleteComment(req.params.id as string, req.params.commentId as string, req.auth.userId, req.auth.role);
  res.status(204).send();
}
