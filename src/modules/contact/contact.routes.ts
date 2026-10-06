import express from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validation.js';
import { contactController } from './contact.controller.js';
import { contactSubmissionSchema } from './contact.validation.js';

const router = express.Router({ caseSensitive: true });

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many contact requests. Please try again later.',
  },
});

router.post('/', contactLimiter, validate(contactSubmissionSchema), contactController.submit);

export const ContactRoutes = router;
