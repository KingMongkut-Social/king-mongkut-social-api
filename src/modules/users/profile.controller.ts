import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import * as postService from '../posts/post.service.js';
import type { EditProfileInput, ProfileFriendsQuery, ProfilePostsQuery } from './profile.schemas.js';
import * as profileService from './profile.service.js';

export async function editMe(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const user = await profileService.editProfile(req.auth.userId, req.body as EditProfileInput);
  res.json({ success: true, data: { user } });
}

export async function clearAvatar(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const user = await profileService.setProfileImage(req.auth.userId, 'avatar', null);
  res.json({ success: true, data: { user } });
}

export async function clearCover(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const user = await profileService.setProfileImage(req.auth.userId, 'cover', null);
  res.json({ success: true, data: { user } });
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  const profile = await profileService.getProfile(String(req.params.userId), req.auth?.userId);
  res.json({ success: true, data: { profile } });
}

export async function getPosts(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId);
  await profileService.assertProfileExists(userId);
  const result = await postService.listPublishedByUser(userId, req.query as unknown as ProfilePostsQuery, req.auth?.userId);
  res.json({ success: true, data: result });
}

export async function getFriends(req: Request, res: Response): Promise<void> {
  const result = await profileService.listProfileFriends(String(req.params.userId), req.query as unknown as ProfileFriendsQuery);
  res.json({ success: true, data: result });
}
