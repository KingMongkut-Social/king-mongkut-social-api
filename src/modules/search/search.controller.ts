import type { Request, Response } from 'express';
import * as service from './search.service.js';

export async function search(req: Request, res: Response) {
  res.json({
    success: true,
    data: await service.search(
      String(req.query.q),
      Number(req.query.limit ?? 8),
      req.auth?.userId,
    ),
  });
}
