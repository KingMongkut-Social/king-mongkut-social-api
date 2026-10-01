import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

export const requireCompleteProfile: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
  if (req.auth.needsProfileCompletion) {
    return next(new AppError(403, 'PROFILE_INCOMPLETE', 'กรุณากรอกข้อมูลโปรไฟล์ที่จำเป็นให้ครบก่อนใช้งาน'));
  }
  next();
};
