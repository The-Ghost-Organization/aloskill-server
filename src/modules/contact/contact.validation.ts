import { z } from 'zod';

const personName = z
  .string()
  .trim()
  .min(2, 'Please enter at least 2 characters')
  .max(60, 'Name must not exceed 60 characters')
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u, 'Please enter a valid name');

export const contactSubmissionSchema = z.object({
  body: z.object({
    firstName: personName,
    lastName: personName,
    email: z.string().trim().email('Please enter a valid email address').max(120),
    subject: z.string().trim().min(5).max(160),
    message: z.string().trim().min(20).max(3000),
    website: z.string().max(200).optional().default(''),
  }),
});
