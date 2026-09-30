import type { Request, Response } from 'express';
import * as service from './search.service.js';

export async function search(req: Request, res: Response) {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json({
    success: true,
    data: await service.search(
      q,
      Number(req.query.limit ?? 8),
      req.auth?.userId,
    ),
  });
}
