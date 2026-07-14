import { generalLimiter } from '../../middleware/security.js';
import express from 'express';
import { requireAuth, requireStudent } from '../../middleware/auth.js';
import { orderController } from './order.controller.js';
import { validate } from '../../middleware/validation.js';
import { CreateOrderWithEPS } from './order.validation.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.post('/create-payment', requireStudent, orderController.createPayment);

router.post('/validate-ipn', orderController.validateIPN);

router.post("/create-order-with-EPS", requireAuth,validate(CreateOrderWithEPS), orderController.createOrderWithEPS);

export const OrderRoutes = router;
