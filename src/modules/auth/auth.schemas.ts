import { z } from 'zod';

export const profileSchema = z.strictObject({
  faculty: z.string().trim().min(1, 'กรุณากรอกคณะ').max(150, 'คณะต้องไม่เกิน 150 ตัวอักษร'),
  department: z.string().trim().min(1, 'กรุณากรอกภาควิชา').max(150, 'ภาควิชาต้องไม่เกิน 150 ตัวอักษร'),
});

export type ProfileInput = z.infer<typeof profileSchema>;
