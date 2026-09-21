import express from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { requireAdmin, requireInstructor, requireStudent } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import { bookController } from './book.controller.js';
import {
  CreateBookAuthorSchema,
  CreateBookCategorySchema,
  CreateBookSchema,
  DeleteBookSchema,
  UpdateBookSellingSchema,
  UpdateBookStockSchema,
} from './book.validation.js';

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
router.get('/authors', bookController.getBookAuthors);
router.get('/public/authors/:slug', bookController.getPublicAuthorProfile);

router.get('/public/all-books', bookController.getAllBooksForPublicView);

router.get('/instructor/:instructorId/books', bookController.getPublishedBooksByInstructor);

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

router.patch(
  '/admin/books/:bookId/selling',
  requireAdmin,
  validate(UpdateBookSellingSchema),
  bookController.updateBookSelling
);

router.patch(
  '/admin/books/:bookId/stock',
  requireAdmin,
  validate(UpdateBookStockSchema),
  bookController.updateBookStock
);

router.patch(
  '/admin/books/:bookId/delete',
  requireAdmin,
  validate(DeleteBookSchema),
  bookController.deleteBook
);

router.post(
  '/admin/categories',
  requireAdmin,
  validate(CreateBookCategorySchema),
  bookController.createBookCategory
);

router.get('/admin/author-candidates', requireAdmin, bookController.getAuthorCandidates);

router.post(
  '/admin/authors',
  requireAdmin,
  validate(CreateBookAuthorSchema),
  bookController.createBookAuthor
);

router.get('/instructor/books', requireInstructor, bookController.getAllBooksDataForInstructor);

router.get(
  '/instructor/books/edit',
  requireInstructor,
  bookController.getSingleBookDataForInstructorEdit
);

export const BookRoutes = router;
