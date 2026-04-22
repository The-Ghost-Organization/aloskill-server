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
  '/admin/all-books-data',
  requireAdmin,
  bookController.getAllBooksDataforAdmin
);

router.get(
  '/admin/books/edit',
  requireAdmin,
  bookController.getSingleBookDataForAdminEdit
);

router.patch(
  '/admin/books/approve',
  requireAdmin,
  bookController.approvedBook
);

export const BookRoutes = router;
