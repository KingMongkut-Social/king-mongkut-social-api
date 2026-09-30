import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';

const uploadDir = resolve(env.UPLOAD_DIR);
const maxFileSize = 10 * 1024 * 1024;
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const mimeByExtension = Object.fromEntries(Object.entries(extensions).map(([mime, extension]) => [extension, mime]));

export async function hasExpectedSignature(path: string, mimeType: string): Promise<boolean> {
  const file = await open(path, 'r');
  const bytes = Buffer.alloc(32);
  try {
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead === 0) return false;
    const prefix = bytes.subarray(0, bytesRead);
    switch (mimeType) {
      case 'image/jpeg': return prefix.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
      case 'image/png': return prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      case 'image/gif': return ['GIF87a', 'GIF89a'].includes(prefix.toString('ascii', 0, 6));
      case 'image/webp': return prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP';
      case 'image/avif': return prefix.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(prefix.toString('ascii', 8, 12));
      case 'application/pdf': return prefix.toString('ascii', 0, 5) === '%PDF-';
      case 'application/msword': return prefix.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      case 'text/plain': return !prefix.includes(0);
      default: return false;
    }
  } finally {
    await file.close();
  }
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
      callback(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported upload type'));
      return;
    }
    callback(null, true);
  },
}).single('file');

export const uploadPostAsset: RequestHandler = (req, res, next) => {
  uploader(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(error.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'File is too large')
        : new AppError(400, 'BAD_REQUEST', 'Expected one multipart file field named file'));
      return;
    }
    if (error) return next(error);
    if (!req.file) return next(new AppError(400, 'BAD_REQUEST', 'File is required'));
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
        throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'File content does not match its type');
      }
      const name = Array.from(uploadedFile.originalname)
        .filter((char) => char !== '/' && char !== '\\' && char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127)
        .join('').slice(0, 255) || 'attachment';
      res.status(201).json({
        success: true,
        data: {
          asset: {
            url: `/api/v1/posts/uploads/${uploadedFile.filename}`,
            name,
            mimeType: uploadedFile.mimetype,
            size: uploadedFile.size,
          },
        },
      });
    })().catch(next);
  });
};

export const servePostAsset: RequestHandler = (req, res, next) => {
  const filename = req.params.filename;
  if (typeof filename !== 'string' || !/^[a-f0-9-]{36}\.(jpg|png|gif|webp|avif|pdf|txt|doc|docx)$/.test(filename)) {
    next(new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found'));
    return;
  }
  const extension = filename.slice(filename.lastIndexOf('.') + 1);
  const mimeType = mimeByExtension[extension];
  if (!mimeType) {
    next(new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found'));
    return;
  }
  res.type(mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!mimeType.startsWith('image/')) res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filename, { root: uploadDir }, (error) => {
    if (error && !res.headersSent) next(new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found'));
  });
};
