/* eslint-disable require-await */
/* eslint-disable @typescript-eslint/require-await */
import { loginSchema, registerSchema } from '@/validations/auth.js';
import { Router } from 'express';
import { validate } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router({ caseSensitive: true });

// Routes
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res): Promise<void> => {
    const { email, password } = req.body;
    console.log('login', email, password);
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
