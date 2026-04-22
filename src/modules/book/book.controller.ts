import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { bookService } from './book.service.js';

const uploadBook = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.uploadBook(req);
  ResponseHandler.ok(res, 'Book Uploaded Successfully!', result);
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
  uploadBook,
  getAllBooksDataforAdmin,
  getSingleBookDataForAdminEdit,
  approvedBook
};
