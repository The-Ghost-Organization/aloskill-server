import { z } from 'zod';

export const getSingleUserSchema = z.object({
  params: z.object({
    email: z.email('Invalid email address'),
  }),
});

export const getSingleInstructorSchema = z.object({
  params: z.object({
    id: z.string('Invalid user ID'),
  }),
});

export const adminInstructorIdSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

export const adminInstructorActionSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object({
    action: z.enum(['APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE']),
    note: z.string().trim().min(5).max(500).regex(/^[^<>]*$/),
  }),
});
