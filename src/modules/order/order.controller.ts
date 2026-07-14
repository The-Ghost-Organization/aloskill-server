import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { orderService } from './order.service.js';

const createPayment = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.createPayment(req);
  ResponseHandler.ok(res, 'Payment Created Successfully!', result);
});

const validateIPN = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.validateIPN(req);
  ResponseHandler.ok(res, 'IPN Validated Successfully!', result);
});

const createOrderWithEPS = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.createOrderWithEPS(req);
  ResponseHandler.ok(res, 'Order Created Successfully!', result);
});

export const orderController = {
  createPayment,
  validateIPN,
  createOrderWithEPS,
};

