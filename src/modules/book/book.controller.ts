import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { bookService } from './book.service.js';

const getBooksCategories = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.getBooksCategories();
  ResponseHandler.ok(res, 'Books Categories Retrieved Successfully!', result);
});

const uploadBook = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.uploadBook(req);
  ResponseHandler.ok(res, 'Book Uploaded Successfully!', result);
});

const getSingleBookForCheckout = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.getSingleBookForCheckout(req);
  ResponseHandler.ok(res, 'Book Data Retrieved Successfully!', result);
});

const bulkUploadBooks = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.bulkUploadBooks(req);
  ResponseHandler.ok(res, 'Book Import Completed!', result);
});

const updateBook = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.updateBook(req);
  ResponseHandler.ok(res, 'Book Updated Successfully!', result);
});

const getAllBooksDataforUser = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.getAllBooksDataforUser(req);
  ResponseHandler.ok(res, 'Books Data Retrieved Successfully!', result);
});

const getAllBooksForPublicView = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.getAllBooksForPublicView();
  ResponseHandler.ok(res, 'All Books for public view Retrieved Successfully!', result);
});

const getBookDetailsForPublicView = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.getBookDetailsForPublicView(req);
  ResponseHandler.ok(res, 'Book Details for public view Retrieved Successfully!', result);
});

const getAllBooksDataforAdmin = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.getAllBooksDataforAdmin(req);
  ResponseHandler.ok(res, 'Books Data Retrieved Successfully!', result);
});

const getSingleBookDataForAdminEdit = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.getSingleBookDataForAdminEdit(req);
  ResponseHandler.ok(res, 'Book Data Retrieved Successfully!', result);
});

const approvedBook = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.approveBook(req);
  ResponseHandler.ok(res, 'Book Approved Successfully!', result);
});

export const bookController = {
  getBooksCategories,
  uploadBook,
  bulkUploadBooks,
  updateBook,
  getAllBooksDataforAdmin,
  getSingleBookDataForAdminEdit,
  approvedBook,
  getAllBooksForPublicView,
  getBookDetailsForPublicView,
  getAllBooksDataforUser,
  getSingleBookForCheckout,
};
