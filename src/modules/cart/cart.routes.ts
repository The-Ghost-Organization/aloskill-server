import express from 'express';
import { generalLimiter } from '../../middleware/security.js';
import { cartController } from './cart.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.post('/get-cart-items', requireAuth, cartController.getCartItems);

router.post('/initiate-checkout', requireAuth, cartController.initiateCheckout);

router.get("/get-checkout-summary/:sessionId", requireAuth, cartController.getCheckoutSummary);

export const CartRoutes = router;
