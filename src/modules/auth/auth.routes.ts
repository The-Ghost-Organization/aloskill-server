import express from 'express';
import { authLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import {
  forgotSchema,
  InstructorProfileSchema,
  loginSchema,
  registerSchema,
  resendVerificationEmailSchema,
  resetSchema,
  verifyUserSchema,
} from '../../validations/auth.js';
import { authController } from './auth.controller.js';

const router = express.Router({ caseSensitive: true });

//middleware
router.use(authLimiter);

//routes
router.post('/login', validate(loginSchema), authController.loginUser);
router.post('/register', validate(registerSchema), authController.registerStudent);
router.post(
  '/register-instructor',
  validate(InstructorProfileSchema),
  authController.registerInstructor
);
router.post('/verify-user', validate(verifyUserSchema), authController.verifyUser);
router.post(
  '/resend-verification',
  validate(resendVerificationEmailSchema),
  authController.resendVerificationEmail
);
router.post('/forgot-password', validate(forgotSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetSchema), authController.resetPassword);
router.post('/logout', authController.logoutCurrentDevice);
router.post('/logout-all', authController.logoutAllDevices);
router.post('/refresh', authController.refreshAccessToken);

//named export
export const AuthRoutes = router;
