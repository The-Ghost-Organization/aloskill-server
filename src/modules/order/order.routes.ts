import express from 'express';
import { requireAdmin, requireAuth, requireStudent } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import { orderController } from './order.controller.js';
import { CreateOrderWithUDDOKTAPAY } from './order.validation.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.post('/create-payment', requireStudent, orderController.createPayment);

router.post('/validate-ipn', orderController.validateIPN);

router.post(
  '/create-order-with-UDDOKTAPAY',
  requireAuth,
  validate(CreateOrderWithUDDOKTAPAY),
  orderController.createOrderWithUDDOKTAPAY
);

router.get('/verify-payment', orderController.verifyPayment);

router.post('/uddoktapay-webhook', orderController.verifyPayment);

router.post(
  '/admin/:orderId/create-steadfast',
  requireAdmin,
  orderController.retrySteadfastConsignment
);

router.get('/my-orders', requireAuth, orderController.getMyOrders);

router.get('/shipping-quote', requireAuth, orderController.getShippingQuote);

router.get('/my-orders/:orderId', requireAuth, orderController.getMyOrderById);

router.post(
  '/my-orders/:orderId/refresh-tracking',
  requireAuth,
  orderController.refreshMyOrderTracking
);

export const OrderRoutes = router;
