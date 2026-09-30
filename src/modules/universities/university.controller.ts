import type { Request, Response } from 'express';
import type { ListPostsQuery } from '../posts/post.schemas.js';
import * as service from './university.service.js';
import type { UniversityCode } from './university.schemas.js';

export async function list(_req: Request, res: Response) {
  res.json({ success: true, data: { items: await service.listUniversities() } });
}

export async function get(req: Request, res: Response) {
  res.json({
    success: true,
    data: { university: await service.getUniversity(req.params.code as UniversityCode) },
  });
}

export async function posts(req: Request, res: Response) {
  res.json({
    success: true,
    data: await service.listUniversityPosts(
      req.params.code as UniversityCode,
      req.query as unknown as ListPostsQuery,
      req.auth?.userId,
    ),
  });
}

export async function members(req: Request, res: Response) {
  res.json({
    success: true,
    data: await service.listMembers(
      req.params.code as UniversityCode,
      Number(req.query.page ?? 1),
      Number(req.query.limit ?? 20),
    ),
  });
}
