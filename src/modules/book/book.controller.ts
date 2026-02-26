import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { bookService } from './book.service.js';

const uploadBook = catchAsync(async (req, res): Promise<void> => {
  const result = await bookService.uploadBook(req);
  ResponseHandler.ok(res, 'Book Uploaded Successfully!', result.id);
});


export const bookController = {
  uploadBook
};
