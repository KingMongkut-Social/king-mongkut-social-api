import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import * as service from './group.service.js';
import type { GroupRole } from './group-member.model.js';

function auth(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth;
}

export async function list(req: Request, res: Response) {
  res.json({ success: true, data: await service.listGroups(req.query as never, req.auth?.userId) });
}

export async function userGroups(req: Request, res: Response) {
  res.json({
    success: true,
    data: {
      items: await service.listUserGroups(String(req.params.userId), req.auth?.userId),
    },
  });
}

export async function create(req: Request, res: Response) {
  res.status(201).json({
    success: true,
    data: { group: await service.createGroup(auth(req).userId, req.body as never) },
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
    data: { group: await service.joinGroup(String(req.params.id), auth(req).userId) },
  });
}

export async function leave(req: Request, res: Response) {
  res.json({
    success: true,
    data: await service.leaveGroup(String(req.params.id), auth(req).userId),
  });
}

export async function addMember(req: Request, res: Response) {
  const actor = auth(req);
  const body = req.body as { userId: string };
  res.status(201).json({
    success: true,
    data: { membership: await service.addMember(String(req.params.id), actor.userId, body.userId) },
  });
}

export async function updateMemberRole(req: Request, res: Response) {
  const actor = auth(req);
  const body = req.body as { role: GroupRole };
  res.json({
    success: true,
    data: {
      membership: await service.updateMemberRole(
        String(req.params.id),
        actor.userId,
        String(req.params.userId),
        body.role,
      ),
    },
  });
}

export async function removeMember(req: Request, res: Response) {
  const actor = auth(req);
  res.json({
    success: true,
    data: await service.removeMember(String(req.params.id), actor.userId, String(req.params.userId)),
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
  const actor = auth(req);
  res.status(201).json({
    success: true,
    data: {
      post: await service.createPost(
        String(req.params.id),
        actor.userId,
        String((req.body as { content: string }).content),
      ),
    },
  });
}

export async function removePost(req: Request, res: Response) {
  const actor = auth(req);
  await service.deletePost(String(req.params.id), String(req.params.postId), actor.userId, actor.role);
  res.status(204).send();
}

export async function removeGroup(req: Request, res: Response) {
  await service.deleteGroup(String(req.params.id), auth(req).userId);
  res.status(204).send();
}
