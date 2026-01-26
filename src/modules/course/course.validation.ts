import { z } from 'zod';

const quizQuestionSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(10, 'Question text must be at least 10 characters long')
      .max(200, 'Question text cannot exceed 200 characters')
      .regex(
        /^[\w\s\p{P}&\-?+]+$/u,
        'Question title contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
      ),
    position: z.number('Position must be an integer').int().positive(),
    type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SINGLE_CHOICE'], 'Question type is required'),
    points: z
      .number('Points must be a number')
      .int()
      .positive()
      .min(1)
      .max(10, 'Points cannot exceed 10'),
    options: z
      .array(
        z.object({
          text: z
            .string()
            .trim()
            .min(1, 'Option text must be at least 1 characters long')
            .max(50, 'Option text cannot exceed 50 characters')
            .regex(
              /^[\w\s\p{P}&\-]+$/u,
              'Option Text contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
            ),
          position: z.number('Position must be an integer').int().positive(),
          isCorrect: z.boolean('isCorrect must be a boolean'),
        })
      )
      .min(2, 'At least two options are required')
      .max(4, 'No more than 4 options are allowed')
      .refine(options => {
        const texts = options.map((option: any) => option.text.toLowerCase());
        return texts.length === new Set(texts).size;
      }, 'Option texts must be unique'),
  })
  .superRefine((data, ctx) => {
    const correctOptions = data.options.filter(opt => opt.isCorrect);
    if (correctOptions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one option must be marked as correct.',
        path: ['options'],
      });
    }
    if (data.type === 'SINGLE_CHOICE' && correctOptions.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one option can be marked as correct for SINGLE_CHOICE questions.',
        path: ['options'],
      });
    }
    if (data.type === 'MULTIPLE_CHOICE' && correctOptions.length > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Less than 3 or equal to 3 can be marked as correct for MULTIPLE_CHOICE questions.',
        path: ['options'],
      });
    }
    if (data.type === 'TRUE_FALSE' && data.options.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TRUE_FALSE questions must have exactly 2 options.',
        path: ['options'],
      });
    }
  });

const courseQuizSchema = z.object({
  title: z
    .string()
    .min(20, 'Quiz title must be at least 20 characters long')
    .max(500, 'Quiz title cannot exceed 500 characters')
    .regex(
      /^[\w\s\p{P}&\-]+$/u,
      'Quiz title contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
    ),
  description: z
    .string()
    .min(20, 'Quiz description must be at least 20 characters long')
    .regex(
      /^[\w\s\p{P}&\-]+$/u,
      'Quiz description contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
    ),
  duration: z.number('Duration must be a number and must be positive').int().positive().min(1).max(60).nullable().optional(),
  passingScore: z.number('Passing score must be a number').int().positive().min(1).max(100),
  attemptsAllowed: z.number('attemptsAllowed must be a number').int().positive().min(1).max(10),
  questions: z.array(quizQuestionSchema).nonempty('At least one question is required'),
});

const courseLessonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'LessonTitle must be at least 5 characters long')
    .max(150, 'LessonTitle cannot exceed 150 characters')
    .regex(
      /^[\w\s\p{P}&\-]+$/u,
      'LessonTitle contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
    ),
  position: z.number('Position must be an integer').int().positive(),
  notes: z.preprocess(
    val => (val === '' ? undefined : val),
    z
      .string()
      .trim()
      .min(20, 'Notes must be at least 20 characters long')
      .max(1000, 'Notes cannot exceed 1000 characters')
      .regex(
        /^[\w\s\p{P}&\-]+$/u,
        'Notes contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
      )
      .optional()
  ),
  description: z.preprocess(
    val => (val === '' ? undefined : val),
    z
      .string()
      .trim()
      .min(20, 'Description must be at least 20 characters long')
      .regex(
        /^[\w\s\p{P}&\-]+$/u,
        'Description contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
      )
      .optional()
  ),
  type: z.enum(['VIDEO', 'ARTICLE', 'QUIZ'], 'Type is required'),
  contentUrl: z
    .object({
      name: z.string().optional(),
      url: z.preprocess(
        val => (typeof val === 'string' && val.trim() === '' ? undefined : val),
        z.string().url('Content url must be a valid URL (http:// or https://)').optional()
      ),
    })
    .optional()
    .nullable(),
  files: z
    .array(
      z.object({
        name: z.string(),
        url: z.url(
          'Content url Must be a valid URL format (e.g., starting with http:// or https://)'
        ),
      })
    )
    .optional(),
  duration: z.number('Lesson Duration must be a number and must be positive').int().positive().min(1).nullable().optional(),
  quiz: courseQuizSchema.optional(),
});

const courseModuleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters long')
    .max(150, 'Title cannot exceed 150 characters')
    .regex(
      /^[\w\s\p{P}&\-]+$/u,
      'Title contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
    ),
  position: z.number('Position must be an integer').int().positive(),
  lessons: z.array(courseLessonSchema).nonempty('At least one lesson is required'),
});

export const CreateCourseSchema = z.object({
  body: z
    .object({
      id: z.uuid().nullable().optional(),
      title: z
        .string()
        .trim()
        .min(1, 'Title is Required For the course')
        .min(5, 'Title must be at least 5 characters long')
        .max(100, 'Title cannot exceed 100 characters')
        .regex(
          /^[\w\s\p{P}&\-]+$/u,
          'Title contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'
        ),
      slug: z
        .string()
        .trim()
        .min(1, 'Slug is Required For the course')
        .min(3, 'Slug must be at least 3 characters long')
        .max(50, 'Slug cannot exceed 50 characters')
        .regex(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
          'Slug use only lowercase letters and hyphens instead of spaces, and contain no special characters.'
        ),
      tags: z
        .array(z.string('Tag is required'), 'Tag is required For this Course')
        .min(1, 'At least one tag is required')
        .refine(
          items => {
            const lowercaseItems = items.map(item => item.toLowerCase());
            return lowercaseItems.length === new Set(lowercaseItems).size;
          },
          { message: 'Tags must be unique' }
        ),
      category: z.string('Category is required').min(3, 'Category is required'),
      subCategory: z.string('SubCategory is required').min(3, 'SubCategory is required').optional(),
      language: z.enum(['ENGLISH', 'BANGLA'], 'Language is required'),
      level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'], 'Level is required'),
      description: z
        .string()
        .trim()
        .min(10, 'Description must be at least 10 characters long')
        .regex(/^[^<>]*$/, 'Description must not contain any opening or closing HTML tags'),
      welcomeMessage: z
        .string()
        .max(1000, 'Welcome Message cannot exceed 1000 characters')
        .optional()
        .refine(val => {
          if (val === undefined || val === '') {
            return true;
          }
          return /^[\w\s\p{P}&\-]+$/u.test(val);
        }, 'Welcome Message contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'),
      congratulationsMessage: z
        .string()
        .max(1000, 'Congratulations Message cannot exceed 1000 characters')
        .optional()
        .refine(val => {
          if (val === undefined || val === '') {
            return true;
          }
          return /^[\w\s\p{P}&\-]+$/u.test(val);
        }, 'Congratulations Message contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.'),
      originalPrice: z.coerce.number().min(0).max(9999.99).optional(),
      discountPrice: z.coerce.number().min(0).max(9999.99).optional(),
      discountEndDate: z.coerce.date().optional().nullable(),
      courseInstructors: z
        .array(
          z.object({
            instructorId: z.string(),
            displayName: z.string(),
            role: z.enum(['PRIMARY', 'CO_INSTRUCTOR']),
          })
        )
        .optional(),
      thumbnailUrl: z
        .string()
        .max(500)
        .refine(
          value => {
            try {
              const url = new URL(value);
              return url.protocol === 'https:';
            } catch {
              return false;
            }
          },
          {
            message: 'Thumbnail URL must be a valid HTTPS Bunny CDN URL.',
          }
        )
        .optional()
        .nullable(),
      trailerUrl: z
        .string()
        .max(500)
        .refine(
          value => {
            try {
              const url = new URL(value);
              return url.protocol === 'https:';
            } catch {
              return false;
            }
          },
          {
            message: 'Trailer URL must be a valid HTTPS Bunny CDN URL.',
          }
        )
        .optional()
        .nullable(),
      status: z.enum(['DRAFT', 'PUBLISHED'], 'Status is required'),
      modules: z.array(courseModuleSchema).min(1, 'At least one module is required'),
    })
    .superRefine(({ discountPrice, originalPrice, discountEndDate }, ctx) => {
      if ((discountEndDate === undefined) !== (discountPrice === undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Both "discountEndDate" and "discountPrice" should either be provided together or neither should be provided.',
          path: ['discountEndDate', 'discountPrice'],
        });
      }
      if (discountPrice && originalPrice && discountPrice >= originalPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Discount price must be strictly less than the original price.',
          path: ['discountPrice'],
        });
      }
    }),
});

export const GetAndDeleteVideoSchema = z.object({
  body: z.object({
    videoUrl: z.string(),
  }),
});

export const GetSecureVideoToken = z.object({
  body: z.object({
    filePath: z.string(),
    duration: z.number().min(1).max(86400),
  }),
});

export type CreateCoursePayload = z.infer<typeof CreateCourseSchema>;
