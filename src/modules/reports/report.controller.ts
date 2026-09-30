import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import * as service from './report.service.js';
import type { ReportStatus } from './report.model.js';

function auth(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth;
}
function admin(req: Request) {
  const value = auth(req);
  if (value.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Admin access required');
  return value;
}

export async function create(req: Request, res: Response) {
  const user = auth(req);
  res.status(201).json({
    success: true,
    data: { report: await service.createReport(user.userId, req.body as never) },
  });
}
export async function list(req: Request, res: Response) {
  admin(req);
  res.json({
    success: true,
    data: await service.listReports(
      (req.query.status ?? 'pending') as ReportStatus,
      Number(req.query.page ?? 1),
      Number(req.query.limit ?? 20),
    ),
  });
}
export async function moderate(req: Request, res: Response) {
  const user = admin(req);
  const body = req.body as {
    action: 'dismiss' | 'remove_content' | 'suspend_user' | 'restore_user';
    note?: string;
  };
  res.json({
    success: true,
    data: {
      report: await service.moderate(String(req.params.id), user.userId, body.action, body.note),
    },
  });
}
