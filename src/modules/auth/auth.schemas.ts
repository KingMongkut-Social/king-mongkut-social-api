import { z } from 'zod';

export const profileSchema = z.strictObject({
  name: z.string().trim().min(2, 'ชื่อที่แสดงต้องมีอย่างน้อย 2 ตัวอักษร').max(80, 'ชื่อที่แสดงต้องไม่เกิน 80 ตัวอักษร').optional(),
  username: z.string().trim().toLowerCase().regex(
    /^[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$/,
    'Username ต้องมี 3–30 ตัว ใช้ a–z, 0–9, _ หรือ .',
  ).nullable().optional(),
  bio: z.string().trim().max(500, 'Bio ต้องไม่เกิน 500 ตัวอักษร').optional(),
  faculty: z.string().trim().min(1, 'กรุณากรอกคณะ').max(150, 'คณะต้องไม่เกิน 150 ตัวอักษร').optional(),
  department: z.string().trim().min(1, 'กรุณากรอกภาควิชา').max(150, 'ภาควิชาต้องไม่เกิน 150 ตัวอักษร').optional(),
  academicYear: z.number().int().min(1).max(8).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one profile field is required',
});

export type ProfileInput = z.infer<typeof profileSchema>;
