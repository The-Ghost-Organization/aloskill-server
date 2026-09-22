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

export const updateInstructorSettingsSchema = z.object({
  body: z.object({
    displayName: z.string().min(3).max(60).optional(),
    phoneNumber: z
      .string()
      .min(11)
      .max(14)
      .regex(/^[0-9+]+$/)
      .optional(),
    expertise: z.string().max(100).nullable().optional(),
    bio: z.string().min(10).max(4000).optional(),
    website: z.string().url().nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    qualifications: z.string().max(100).optional(),
    currentOrg: z.string().max(60).nullable().optional(),
    experience: z.number().min(0).max(50).optional(),
    address: z.string().max(255).optional(),
    city: z.string().max(50).optional(),
    nationality: z.string().max(50).optional(),
    socialAccounts: z
      .array(
        z.object({
          platform: z.enum(['FACEBOOK', 'TWITTER', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE']),
          url: z.string().url(),
        })
      )
      .optional(),
  }),
});
