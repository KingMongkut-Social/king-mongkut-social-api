import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/\d/, 'Password must include a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: passwordSchema,
  university: z.enum(['KMITL', 'KMUTNB', 'KMUTT'], {
    message: 'University must be KMITL, KMUTNB, or KMUTT',
  }),
});

export const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export type University = 'KMITL' | 'KMUTNB' | 'KMUTT';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  university: University;
}

export interface LoginInput {
  email: string;
  password: string;
}