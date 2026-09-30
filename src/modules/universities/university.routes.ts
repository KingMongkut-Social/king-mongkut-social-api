import { Router } from 'express';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './university.controller.js';
import { universityListQuerySchema, universityParamsSchema } from './university.schemas.js';

export const universityRouter = Router();

universityRouter.get('/', asyncHandler(controller.list));
universityRouter.get('/:code', validate({ params: universityParamsSchema }), asyncHandler(controller.get));
universityRouter.get(
  '/:code/posts',
  optionalAuthenticate,
  validate({ params: universityParamsSchema, query: universityListQuerySchema }),
  asyncHandler(controller.posts),
);
universityRouter.get(
  '/:code/members',
  validate({
    params: universityParamsSchema,
    query: universityListQuerySchema.pick({ page: true, limit: true }),
  }),
  asyncHandler(controller.members),
);
