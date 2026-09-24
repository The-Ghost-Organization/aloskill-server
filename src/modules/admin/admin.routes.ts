import express from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/security.js';
import { adminController } from './admin.controller.js';

const router = express.Router({ caseSensitive: true });
router.use(generalLimiter, requireAdmin);
router.get('/dashboard', adminController.adminDashboard);
router.get('/all-approvals', adminController.allApprovals);
router.get('/approvals/:type/:id', adminController.approvalDetail);
router.patch('/approvals/:type/:id', adminController.decideApproval);
export const AdminRoutes = router;
