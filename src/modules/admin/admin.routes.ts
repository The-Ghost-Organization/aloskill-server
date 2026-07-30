import express from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/security.js';
import { adminController } from './admin.controller.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.get(
  '/all-approvals',
  requireAdmin,
  adminController.allApprovals
);

export const AdminRoutes = router;
