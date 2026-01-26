import { generalLimiter } from '../../middleware/security.js';
import express from 'express';
import { requireStudent } from '../../middleware/auth.js';
import { orderController } from './order.controller.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.post('/create-payment', requireStudent, orderController.createPayment);

router.post('/validate-ipn', orderController.validateIPN);

export const OrderRoutes = router;
