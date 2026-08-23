import express from 'express';
import { requireAdmin, requireInstructor } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import { bookController } from './book.controller.js';
import { CreateBookSchema } from './book.validation.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.get('/public/all-books', bookController.getAllBooksForPublicView);

router.post(
  '/upload-book',
  requireInstructor,
  validate(CreateBookSchema),
  bookController.uploadBook
);

router.get('/book-details/:bookId', bookController.getBookDetailsForPublicView);

router.put(
  '/update-book',
  requireInstructor,
  validate(CreateBookSchema),
  bookController.updateBook
);

router.get('/admin/all-books-data', requireAdmin, bookController.getAllBooksDataforAdmin);

router.get('/admin/books/edit', requireAdmin, bookController.getSingleBookDataForAdminEdit);

router.patch('/admin/books/approve', requireAdmin, bookController.approvedBook);

export const BookRoutes = router;
