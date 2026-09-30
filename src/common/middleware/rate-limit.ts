import { rateLimit, type Options } from 'express-rate-limit';

const common: Partial<Options> = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    });
  },
};

export const apiRateLimit = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1_000,
  limit: 300,
});

export const authRateLimit = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  skipSuccessfulRequests: true,
});

// Count redirects too, otherwise starting OAuth could create unlimited transactions.
export const googleAuthRateLimit = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 40 });

export const postUploadRateLimit = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 30 });
export const profileUploadRateLimit = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 20 });
