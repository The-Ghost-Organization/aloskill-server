import express from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { requireAdmin, requireInstructor, requireStudent } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import { bookController } from './book.controller.js';
import { CreateBookSchema } from './book.validation.js';

const router = express.Router({ caseSensitive: true });

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback: FileFilterCallback) => {
    const allowed = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]);
    if (!allowed.has(file.mimetype)) {
      callback(new Error('Only .xlsx or .xls files are allowed.'));
      return;
    }

    callback(null, true);
  },
});

router.use(generalLimiter);

router.get('/categories', bookController.getBooksCategories);

router.get('/public/all-books', bookController.getAllBooksForPublicView);

router.get('/public/book-details/:bookId', bookController.getBookDetailsForPublicView);

router.get('/user/checkout/:bookId', requireStudent, bookController.getSingleBookForCheckout);

router.post(
  '/upload-book',
  requireInstructor,
  validate(CreateBookSchema),
  bookController.uploadBook
);

router.post(
  '/bulk-upload-books',
  requireInstructor,
  excelUpload.single('file'),
  bookController.bulkUploadBooks
);

router.get('/book-details/:bookId', bookController.getBookDetailsForPublicView);

router.put(
  '/update-book',
  requireInstructor,
  validate(CreateBookSchema),
  bookController.updateBook
);

router.get('/user/all-books-data', requireStudent, bookController.getAllBooksDataforUser);

router.get('/admin/all-books-data', requireAdmin, bookController.getAllBooksDataforAdmin);

router.get('/admin/books/edit', requireAdmin, bookController.getSingleBookDataForAdminEdit);

router.patch('/admin/books/approve', requireAdmin, bookController.approvedBook);

export const BookRoutes = router;
