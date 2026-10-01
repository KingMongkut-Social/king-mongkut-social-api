import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import * as chatService from './chat.service.js';

function userId(req: Request): string {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.userId;
}

export async function list(req: Request, res: Response) {
  res.json({ success: true, data: await chatService.listChats(userId(req)) });
}

export async function createDirect(req: Request, res: Response) {
  const { userId: otherId } = req.body as { userId: string };
  const result = await chatService.createDirectChat(userId(req), otherId);
  res.status(result.created ? 201 : 200).json({ success: true, data: result.chat });
}

export async function createGroup(req: Request, res: Response) {
  const { name, memberIds } = req.body as { name: string; memberIds: string[] };
  const chat = await chatService.createGroupChat(userId(req), name, memberIds);
  res.status(201).json({ success: true, data: chat });
}

export async function messages(req: Request, res: Response) {
  const { limit, before } = req.query as unknown as { limit: number; before?: string };
  const data = await chatService.listMessages(userId(req), String(req.params.chatId), limit, before);
  res.json({ success: true, data });
}

export async function send(req: Request, res: Response) {
  const { content, images } = req.body as { content: string; images?: string[] };
  const message = await chatService.sendMessage(userId(req), String(req.params.chatId), content, images ?? []);
  res.status(201).json({ success: true, data: message });
}
