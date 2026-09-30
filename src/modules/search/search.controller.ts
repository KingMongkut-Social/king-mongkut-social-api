import type { Request, Response } from 'express';
import * as service from './search.service.js';

export async function search(req: Request, res: Response) {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const rawType = typeof req.query.type === 'string' ? req.query.type : 'all';
  const type: 'all' | 'users' | 'posts' | 'groups' | 'universities' =
    rawType === 'users' || rawType === 'posts' || rawType === 'groups' || rawType === 'universities'
      ? rawType
      : 'all';
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 8);
  res.json({
    success: true,
    data: await service.search(
      { q, type, page, limit },
      req.auth?.userId,
    ),
  });
}


