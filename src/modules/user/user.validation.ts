/* eslint-disable @typescript-eslint/explicit-function-return-type */
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

const safeText = (min = 1, max = 500) => z.string().trim().min(min).max(max).regex(/^[^<>]*$/);

export const adminUserIdSchema = z.object({
  params: z.object({ id: z.uuid() }),
});

export const adminCreateUserSchema = z.object({
  body: z.discriminatedUnion('role', [
    z.object({
      role: z.literal('STUDENT'),
      email: z.email(),
      password: z.string().min(8).max(72),
      avatarUrl: z.url().optional().or(z.literal('')),
      displayName: safeText(2, 100),
      phoneNumber: z.string().trim().min(7).max(20),
      gender: z.enum(['MALE', 'FEMALE']),
      bio: safeText(1, 1000).optional().or(z.literal('')),
      isEmailVerified: z.boolean().default(true),
    }),
    z.object({
      role: z.literal('INSTRUCTOR'),
      email: z.email(),
      password: z.string().min(8).max(72),
      avatarUrl: z.url().optional().or(z.literal('')),
      displayName: safeText(2, 100),
      phoneNumber: z.string().trim().min(7).max(20),
      DOB: z.iso.date(),
      gender: z.enum(['MALE', 'FEMALE']),
      nationality: safeText(2, 80),
      address: safeText(5, 255),
      city: safeText(2, 20),
      qualifications: safeText(2, 500),
      experience: z.coerce.number().int().min(0).max(80),
      expertise: safeText(2, 250).optional().or(z.literal('')),
      currentOrg: safeText(2, 150).optional().or(z.literal('')),
      proposedCourseCategory: safeText(2, 100),
      courseLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
      courseType: z.enum(['LIVE', 'PRE_RECORDED', 'HYBRID', 'SELF_STUDY']),
      teachingExperience: z.coerce.number().min(0).max(80),
      prevTeachingApproach: z.enum(['INTERACTIVE', 'VIDEO', 'LIVE', 'PROJECT_BASED']),
      language: z.enum(['ENGLISH', 'BANGLA']),
      demoVideo: z.url().optional().or(z.literal('')),
      bio: safeText(10, 2000),
      website: z.url().optional().or(z.literal('')),
      skills: z.array(safeText(1, 50)).max(20).default([]),
      applicationStatus: z.enum(['PENDING', 'APPROVED']).default('APPROVED'),
      isEmailVerified: z.boolean().default(true),
    }),
  ]),
});

export const adminUserActionSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object({
    action: z.enum(['VERIFY_EMAIL', 'SUSPEND', 'REACTIVATE', 'APPROVE_INSTRUCTOR', 'REJECT_INSTRUCTOR']),
    note: z.string().trim().max(500).regex(/^[^<>]*$/).optional().default(''),
  }).superRefine((value, ctx) => {
    if (['SUSPEND', 'REJECT_INSTRUCTOR'].includes(value.action) && value.note.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'A reason of at least 5 characters is required.' });
    }
  }),
});
