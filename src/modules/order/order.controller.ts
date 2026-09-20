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

const createOrderWithEPS = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.createOrderWithEPS(req);
  ResponseHandler.ok(res, 'Order Created Successfully!', result);
});

const getMyOrders = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.getMyOrders(req);
  ResponseHandler.ok(res, 'Orders retrieved successfully!', result);
});

const getMyOrderById = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.getMyOrderById(req);
  ResponseHandler.ok(res, 'Order retrieved successfully!', result);
});

const refreshMyOrderTracking = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.refreshMyOrderTracking(req);
  ResponseHandler.ok(res, 'Courier tracking refreshed successfully!', result);
});

const getShippingQuote = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.getShippingQuote(req);
  ResponseHandler.ok(res, 'Shipping quote calculated successfully!', result);
});

const retrySteadfastConsignment = catchAsync(async (req, res): Promise<void> => {
  const result = await orderService.retrySteadfastConsignment(req);
  ResponseHandler.ok(res, 'Steadfast submission processed.', result);
});

export const orderController = {
  createPayment,
  validateIPN,
  createOrderWithUDDOKTAPAY,
  createOrderWithEPS,
  verifyPayment,
  getMyOrders,
  getMyOrderById,
  refreshMyOrderTracking,
  getShippingQuote,
  retrySteadfastConsignment,
};
