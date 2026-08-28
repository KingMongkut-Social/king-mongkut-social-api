import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          configurable: true,
          enumerable: true,
        });
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', z.flattenError(error)));
        return;
      }
      next(error);
    }
  };
}
