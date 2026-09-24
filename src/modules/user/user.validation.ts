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

export const adminInstructorIdSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

export const adminInstructorActionSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object({
    action: z.enum(['APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE']),
    note: z
      .string()
      .trim()
      .min(5)
      .max(500)
      .regex(/^[^<>]*$/),
  }),
});

export const updateStudentSettingsSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(3).max(60).optional(),
    phoneNumber: z
      .string()
      .trim()
      .min(11)
      .max(14)
      .regex(/^[0-9+]+$/)
      .optional(),
    gender: z.enum(['MALE', 'FEMALE']).optional(),
    bio: z.string().trim().max(150).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  }),
});

export const changeStudentPasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(64, 'Password must be less than 64 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
  }),
});
