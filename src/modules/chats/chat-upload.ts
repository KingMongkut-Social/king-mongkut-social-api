import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { hasExpectedSignature } from '../posts/post-upload.js';

const uploadDir = resolve(env.UPLOAD_DIR, 'chat');
const maxFileSize = 10 * 1024 * 1024;
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
const mimeByExtension = Object.fromEntries(
  Object.entries(extensions).map(([mime, extension]) => [extension, mime]),
);

function safeOriginalName(value: string): string {
  return Array.from(value)
    .filter((char) => char !== '/' && char !== '\\' && char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127)
    .join('')
    .slice(0, 255) || 'image';
}

const uploader = multer({
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
  limits: { fileSize: maxFileSize, files: 1, fields: 0 },
  fileFilter(_req, file, callback) {
    if (!extensions[file.mimetype]) {
      callback(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, GIF, WebP, and AVIF images are supported'));
      return;
    }
    callback(null, true);
  },
}).single('file');

export const uploadChatImage: RequestHandler = (req, res, next) => {
  uploader(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(error.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Image is too large')
        : new AppError(400, 'BAD_REQUEST', 'Expected one multipart image field named file'));
      return;
    }
    if (error) return next(error);
    if (!req.file) return next(new AppError(400, 'BAD_REQUEST', 'Image is required'));

    const uploadedFile = req.file;
    void (async () => {
      let valid: boolean;
      try {
        valid = await hasExpectedSignature(uploadedFile.path, uploadedFile.mimetype);
      } catch (readError) {
        await unlink(uploadedFile.path).catch(() => undefined);
        throw readError;
      }
      if (!valid) {
        await unlink(uploadedFile.path).catch(() => undefined);
        throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Image content does not match its type');
      }

      res.status(201).json({
        success: true,
        data: {
          asset: {
            url: `/api/v1/chats/uploads/${uploadedFile.filename}`,
            name: safeOriginalName(uploadedFile.originalname),
            mimeType: uploadedFile.mimetype,
            size: uploadedFile.size,
          },
        },
      });
    })().catch(next);
  });
};

export const serveChatImage: RequestHandler = (req, res, next) => {
  const filename = req.params.filename;
  if (typeof filename !== 'string' || !/^[a-f0-9-]{36}\.(jpg|png|gif|webp|avif)$/.test(filename)) {
    next(new AppError(404, 'ASSET_NOT_FOUND', 'Image not found'));
    return;
  }
  const extension = filename.slice(filename.lastIndexOf('.') + 1);
  const mimeType = mimeByExtension[extension];
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
