import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.email('Invalid email address'),
    password: z.string().optional(),
    googleId: z.string().optional(),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    displayName: z.string().min(3, 'Name must be at least 3 characters'),
    email: z.email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .optional(),
    googleId: z.string().optional(),
    gender: z.enum(['MALE', 'FEMALE']),
    avatarUrl: z.string().optional(),
    bio: z.string().max(150, 'Bio must be less than 150 characters').optional(),
    phoneNumber: z.string().max(14, 'Phone Number must be less than 14 characters').optional(),
  }),
});

export const InstructorProfileSchema = z.object({
  body: z.object({
    email: z.email('Invalid email address').optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .optional()
      .nullable(),
    profileImage: z.url('Profile Image url is required for instructor'),
    displayName: z
      .string()
      .min(6, 'Display name must be at least 6 characters long.')
      .max(40, 'Display name must be less than 60 characters.')
      .regex(/^[a-zA-Z\s]+$/, 'Only letters and spaces allowed for display name.'),
    DOB: z.coerce
      .date({
        error: 'Date of Birth is required.',
      })
      .max(new Date(), 'DOB cannot be in the future.')
      .refine(date => {
        const eighteenYearsAgo = new Date();
        eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
        return date <= eighteenYearsAgo;
      }, 'Instructor must be at least 18 years old.'),
    gender: z.enum(['MALE', 'FEMALE']),
    nationality: z
      .string()
      .min(3, 'Nationality must be more than 3 characters.')
      .max(20, 'Nationality must be less than 20 characters.')
      .regex(/^[a-zA-Z\s]+$/, 'Only letters and spaces allowed for nationality.'),
    // == Contact Info
    phoneNumber: z
      .string()
      .min(11, 'Phone data must be more than 11 characters.')
      .max(14, 'Phone Number must be less than 14 characters.')
      .regex(/^[0-9+]+$/, 'Only Numbers and plus signs are allowed in PhoneNumber'),
    address: z
      .string()
      .min(10, 'Address must be more than 10 characters.')
      .max(255, `Address cannot exceed 255 characters.`),
    city: z
      .string()
      .min(3, 'City must be more than 3 characters.')
      .max(20, `City cannot exceed 20 characters.`),
    // == Professional Info
    qualifications: z
      .string()
      .min(1, 'Qualifications must be more than 1 characters.')
      .max(100, `Qualifications cannot exceed 100 characters.`),
    experience: z
      .number({ error: 'Please enter your experience between 0 to 50' })
      .min(0)
      .max(50)
      .default(0),
    expertise: z
      .string({ error: 'Expertise accept all characters except angle brackets (< >).' })
      .regex(/^[^<>]/, 'Expertise accept all characters except angle brackets (< >).')
      .min(3)
      .max(100)
      .optional()
      .nullable(),
    currentOrg: z
      .string({
        error: 'Current organization accept all characters except angle brackets (< >).',
      })
      .regex(/^[^<>]/, 'Current organization accept all characters except angle brackets (< >).')
      .min(3)
      .max(30)
      .optional()
      .nullable(),
    // == Course Info
    proposedCourseCategory: z
      .string()
      .regex(
        /^[^<>]/,
        'Proposed course category accept all characters except angle brackets (< >).'
      ),
    courseLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
    courseType: z.enum(['LIVE', 'PRE_RECORDED', 'HYBRID', 'SELF_STUDY']),
    // == Content & Teaching Skills
    teachingExperience: z
      .number({ error: 'Please enter your teaching experience between 0 to 50' })
      .min(0)
      .max(50)
      .optional()
      .default(0),
    prevTeachingApproach: z.enum(['INTERACTIVE', 'VIDEO', 'LIVE', 'PROJECT_BASED']),
    language: z.enum(['ENGLISH', 'BANGLA']),
    demoVideo: z
      .url({
        protocol: /^https?$/,
        hostname: z.regexes.domain,
        error: 'Demo video must be a valid URL (including https protocol).',
      })
      .optional()
      .nullable(),
    // == Others Info
    bio: z
      .string({ error: 'Bio must be more than 10 characters and less than 4000 characters' })
      .regex(/^[^<>]{10,4000}$/, 'Angle brackets (< >) are not allowed in Bio.')
      .min(10)
      .max(4000),
    skills: z.array(
      z
        .string({ error: 'Skills must be an array of strings' })
        .regex(/^[^<>]/, 'Skill must contain only letters and spaces')
        .min(3, 'Each skill must have at least 3 characters')
    ),
    website: z
      .url({
        protocol: /^https?$/,
        hostname: z.regexes.domain,
        error: 'Website must be a valid URL (including https protocol).',
      })
      .optional()
      .nullable(),
    socialAccount: z.array(
      z.object({
        platform: z.enum(['FACEBOOK', 'TWITTER', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE']),
        url: z.url({
          protocol: /^https?$/,
          hostname: z.regexes.domain,
          error: 'Social URL must be a valid URL (including https protocol).',
        }),
      })
    ),
  }),
});

export const verifyUserSchema = z.object({
  body: z.object({
    id: z.string('ID is required'),
    token: z.string('Token is required'),
  }),
});

export const resendVerificationEmailSchema = z.object({
  body: z.object({
    email: z.email('Invalid email address'),
  }),
});

export const forgotSchema = z.object({
  body: z.object({
    email: z.email('Invalid email address'),
  }),
});

export const resetSchema = z.object({
  body: z
    .object({
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
      confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
    })
    .refine(data => data.password === data.confirmPassword, { message: "Passwords don't match" }),
  query: z.object({
    id: z.string('ID is required'),
    token: z.string('Token is required'),
  }),
});
