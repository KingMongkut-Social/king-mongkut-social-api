import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { hasExpectedSignature } from '../posts/post-upload.js';
import { setProfileImage } from './profile.service.js';

const uploadDir = resolve(env.UPLOAD_DIR, 'profiles');
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
const mimeByExtension = Object.fromEntries(Object.entries(extensions).map(([mime, extension]) => [extension, mime]));

type ImageKind = 'avatar' | 'cover';

function uploaderFor(kind: ImageKind) {
  return multer({
    storage: multer.diskStorage({
      destination(_req, _file, callback) {
        void mkdir(uploadDir, { recursive: true })
          .then(() => callback(null, uploadDir))
          .catch((error: unknown) => callback(error as Error, uploadDir));
      },
      filename(_req, file, callback) {
        callback(null, `${randomUUID()}.${extensions[file.mimetype]}`);
      },
    }),
    limits: { fileSize: kind === 'avatar' ? 5 * 1024 * 1024 : 10 * 1024 * 1024, files: 1, fields: 0 },
    fileFilter(_req, file, callback) {
      if (!extensions[file.mimetype]) {
        callback(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, GIF, WebP and AVIF images are allowed'));
        return;
      }
      callback(null, true);
    },
  }).single('file');
}

export function uploadProfileImage(kind: ImageKind): RequestHandler {
  const uploader = uploaderFor(kind);
  return (req, res, next) => {
    uploader(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        next(error.code === 'LIMIT_FILE_SIZE'
          ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Image is too large')
          : new AppError(400, 'BAD_REQUEST', 'Expected one multipart image field named file'));
        return;
      }
      if (error) return next(error);
      if (!req.file) return next(new AppError(400, 'BAD_REQUEST', 'Image file is required'));
      const file = req.file;
      void (async () => {
        try {
          if (!await hasExpectedSignature(file.path, file.mimetype)) {
            throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'File content does not match its image type');
          }
          if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
          const url = `/api/v1/users/uploads/${file.filename}`;
          const user = await setProfileImage(req.auth.userId, kind, url);
          res.status(201).json({ success: true, data: {
            user,
            asset: { url, mimeType: file.mimetype, size: file.size },
          } });
        } catch (uploadError) {
          await unlink(file.path).catch(() => undefined);
          throw uploadError;
        }
      })().catch(next);
    });
  };
}

export const serveProfileImage: RequestHandler = (req, res, next) => {
  const filename = req.params.filename;
  if (typeof filename !== 'string' || !/^[a-f0-9-]{36}\.(jpg|png|gif|webp|avif)$/.test(filename)) {
    next(new AppError(404, 'ASSET_NOT_FOUND', 'Image not found'));
    return;
  }
  const mimeType = mimeByExtension[filename.slice(filename.lastIndexOf('.') + 1)];
  if (!mimeType) {
    next(new AppError(404, 'ASSET_NOT_FOUND', 'Image not found'));
    return;
  }
  res.type(mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filename, { root: uploadDir }, (error) => {
    if (error && !res.headersSent) next(new AppError(404, 'ASSET_NOT_FOUND', 'Image not found'));
  });
};
