import { Router } from 'express';
import { optionalAuthenticate } from '../../common/middleware/optional-authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './search.controller.js';
import { searchQuerySchema } from './search.schemas.js';

export const searchRouter = Router();
searchRouter.get('/', optionalAuthenticate, validate({ query: searchQuerySchema }), asyncHandler(controller.search));
