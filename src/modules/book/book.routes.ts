import express from 'express';
import { generalLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import { CreateBookSchema } from './book.validation.js';
import { requireAdmin, requireStudent } from '../../middleware/auth.js';
import { bookController } from './book.controller.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.post(
  '/upload-book',
  requireStudent,
  validate(CreateBookSchema),
  bookController.uploadBook
);

router.get(
  '/admin/books-data',
  requireAdmin,
  bookController.getAllBooksDataforAdmin
);

export const BookRoutes = router;
