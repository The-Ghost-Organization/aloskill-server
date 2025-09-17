import { Router } from 'express';
import { z } from 'zod';
import { authLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  body: z.object({
    email: z.email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

const registerSchema = z.object({
  body: z.object({
    email: z.email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
  }),
});

// Routes
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res): Promise<void> => {
    // Your login logic here
    await req.body;
    res.json({ message: 'Login successful' });
  })
);

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res): Promise<void> => {
    // Your registration logic here
    await req.body;
    res.status(201).json({ message: 'Registration successful' });
  })
);

export const authRoutes = router;
