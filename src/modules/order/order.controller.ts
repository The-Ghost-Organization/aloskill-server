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

const createOrderWithUDDOKTAPAY = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.createOrderWithUDDOKTAPAY(req);
  ResponseHandler.ok(res, 'Order Created Successfully!', result);
});

const verifyPayment = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.verifyPayment(req);
  ResponseHandler.ok(res, 'Payment Verified Successfully!', result);
});

const getMyOrders = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.getMyOrders(req);
  ResponseHandler.ok(res, 'Orders retrieved successfully!', result);
});

const getMyOrderById = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.getMyOrderById(req);
  ResponseHandler.ok(res, 'Order retrieved successfully!', result);
});

export const orderController = {
  createPayment,
  validateIPN,
  createOrderWithUDDOKTAPAY,
  verifyPayment,
  getMyOrders,
  getMyOrderById,
};
