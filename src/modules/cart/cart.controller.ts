import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { cartService } from './cart.service.js';

const getCartItems = catchAsync(async (req, res): Promise<void> => {
  const result = await cartService.getCartItems(req);
  ResponseHandler.ok(res, 'Cart Items Retrieved Successfully!', result);
});

const initiateCheckout = catchAsync(async (req, res): Promise<void> => {
  const result = await cartService.initiateCheckout(req);
  ResponseHandler.ok(res, 'Checkout Initiated Successfully!', result);
});

const getCheckoutSummary = catchAsync(async (req, res): Promise<void> => {
  const result = await cartService.getCheckoutSummary(req);
  ResponseHandler.ok(res, 'Checkout Summary Retrieved Successfully!', result);
});

export const cartController = {
  getCartItems,
  initiateCheckout,
  getCheckoutSummary
};

