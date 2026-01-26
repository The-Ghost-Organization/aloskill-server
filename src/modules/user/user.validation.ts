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
