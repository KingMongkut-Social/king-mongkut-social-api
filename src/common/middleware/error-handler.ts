import type { ErrorRequestHandler } from 'express';
import { ZodError, flattenError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

function hasNumericStatus(error: unknown): error is Error & { status: number } {
  return error instanceof Error
    && 'status' in error
    && typeof (error as Error & { status?: unknown }).status === 'number';
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as Error & { code?: number }).code === 11000;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let normalized: AppError;

  if (error instanceof AppError) {
    normalized = error;
  } else if (error instanceof ZodError) {
    normalized = new AppError(422, 'VALIDATION_ERROR', 'Validation failed', flattenError(error));
  } else if (isDuplicateKeyError(error)) {
    normalized = new AppError(409, 'DUPLICATE_RESOURCE', 'A resource with this value already exists');
  } else if (hasNumericStatus(error) && error.status === 400) {
    normalized = new AppError(400, 'BAD_REQUEST', 'Malformed request body');
  } else if (hasNumericStatus(error) && error.status === 413) {
    normalized = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large');
  } else {
    normalized = new AppError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }

  if (normalized.statusCode >= 500) {
    logger.error({ err: error, method: req.method, path: req.path }, normalized.message);
  } else {
    logger.warn({ err: error, method: req.method, path: req.path }, normalized.message);
  }

  res.status(normalized.statusCode).json({
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
      ...(env.NODE_ENV !== 'production' && normalized.statusCode >= 500
        ? { stack: error instanceof Error ? error.stack : undefined }
        : {}),
    },
  });
};
