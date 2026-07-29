import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { cartService } from './cart.service.js';

const getCartItems = catchAsync(async (req, res): Promise<void> => {
  const result = await cartService.getCartItems(req);
  ResponseHandler.ok(res, 'Cart Items Retrieved Successfully!', result);
});

export const cartController = {
  getCartItems,
};

