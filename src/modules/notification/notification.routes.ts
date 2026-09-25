import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
import { notificationController } from './notification.controller.js';
import { notificationIdSchema } from './notification.validation.js';

const router = express.Router({ caseSensitive: true });
router.use(requireAuth);
router.get('/', notificationController.listMine);
router.get('/unread-count', notificationController.unreadCount);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', validate(notificationIdSchema), notificationController.markRead);
export const NotificationRoutes = router;
