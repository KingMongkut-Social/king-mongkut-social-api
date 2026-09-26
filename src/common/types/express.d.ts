import type { Role } from '../../modules/users/user.model.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        needsProfileCompletion: boolean;
      };
    }
  }
}

export {};
