import { z } from 'zod';
import { universityForEmail } from './institution.js';

const universitySchema = z.enum(['KMITL', 'KMUTNB', 'KMUTT']);

const institutionEmailSchema = z
  .string()
  .email()
  .transform((value) => value.toLowerCase())
  .refine((value) => universityForEmail(value) !== null, {
    message: 'Use a KMITL, KMUTT, or KMUTNB university email',
  });

const passwordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/\d/, 'Password must include a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: institutionEmailSchema,
  password: passwordSchema,
  university: universitySchema,
}).superRefine((value, ctx) => {
  if (universityForEmail(value.email) !== value.university) {
    ctx.addIssue({
      code: 'custom',
      path: ['university'],
      message: 'University does not match the email domain',
    });
  }
});

export const loginSchema = z.object({
  email: institutionEmailSchema,
  password: z.string().min(1).max(128),
});

export const googleLoginSchema = z.object({
  code: z.string().min(8).max(4096),
  university: universitySchema,
});

export type University = z.infer<typeof universitySchema>;

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

export interface GoogleLoginInput {
  code: string;
  university: University;
}
