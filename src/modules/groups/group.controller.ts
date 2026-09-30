import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import * as service from './group.service.js';

function userId(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.userId;
}

export async function list(req: Request, res: Response) {
  res.json({ success: true, data: await service.listGroups(req.query as never, req.auth?.userId) });
}
export async function create(req: Request, res: Response) {
  res.status(201).json({
    success: true,
    data: { group: await service.createGroup(userId(req), req.body as never) },
  });
}
export async function get(req: Request, res: Response) {
  res.json({
    success: true,
    data: { group: await service.getGroup(String(req.params.id), req.auth?.userId) },
  });
}
export async function join(req: Request, res: Response) {
  res.json({
    success: true,
    data: { group: await service.joinGroup(String(req.params.id), userId(req)) },
  });
}
export async function leave(req: Request, res: Response) {
  res.json({
    success: true,
    data: await service.leaveGroup(String(req.params.id), userId(req)),
  });
}
export async function members(req: Request, res: Response) {
  res.json({
    success: true,
    data: await service.listMembers(
      String(req.params.id),
      Number(req.query.page ?? 1),
      Number(req.query.limit ?? 20),
      req.auth?.userId,
    ),
  });
}
export async function posts(req: Request, res: Response) {
  res.json({
    success: true,
    data: await service.listPosts(
      String(req.params.id),
      Number(req.query.page ?? 1),
      Number(req.query.limit ?? 20),
      req.auth?.userId,
    ),
  });
}
export async function createPost(req: Request, res: Response) {
  res.status(201).json({
    success: true,
    data: {
      post: await service.createPost(
        String(req.params.id),
        userId(req),
        String((req.body as { content: string }).content),
      ),
    },
  });
}
