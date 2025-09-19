import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(6, 'Name must be at least 6 characters'),
    email: z.email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    role: z.enum(['student', 'instructor']).default('student'),
  }),
});
