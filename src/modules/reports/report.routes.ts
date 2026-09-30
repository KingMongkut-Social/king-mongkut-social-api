import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { requireCompleteProfile } from '../../common/middleware/require-complete-profile.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './report.controller.js';
import { createReportSchema, listReportsQuerySchema, moderateReportSchema, reportParamsSchema } from './report.schemas.js';

export const reportRouter = Router();

reportRouter.use(authenticate, requireCompleteProfile);
reportRouter.post('/', validate({ body: createReportSchema }), asyncHandler(controller.create));
reportRouter.get('/', validate({ query: listReportsQuerySchema }), asyncHandler(controller.list));
reportRouter.patch(
  '/:id',
  validate({ params: reportParamsSchema, body: moderateReportSchema }),
  asyncHandler(controller.moderate),
);
