import express from 'express';
import { requireAdmin, requireInstructor, requireStudent } from '../../middleware/auth.js';
import { generalLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import { userController } from './user.controller.js';
import {
  adminInstructorActionSchema,
  adminInstructorIdSchema,
  changeStudentPasswordSchema,
  getSingleInstructorSchema,
  getSingleUserSchema,
  updateInstructorSettingsSchema,
  updateStudentSettingsSchema,
} from './user.validation.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.get('/student/me/dashboard', requireStudent, userController.getStudentDashboard);
router.get('/student/me/settings', requireStudent, userController.getStudentSettings);
router.patch(
  '/student/me/settings',
  requireStudent,
  validate(updateStudentSettingsSchema),
  userController.updateStudentSettings
);
router.patch(
  '/student/me/password',
  requireStudent,
  validate(changeStudentPasswordSchema),
  userController.changeStudentPassword
);

router.get('/:email', validate(getSingleUserSchema), userController.getUserByEmail);
router.get('/instructor/me/settings', requireInstructor, userController.getInstructorSettings);
router.patch(
  '/instructor/me/settings',
  requireInstructor,
  validate(updateInstructorSettingsSchema),
  userController.updateInstructorSettings
);

router.get(
  '/instructor/:id',
  validate(getSingleInstructorSchema),
  userController.getSingleInstructor
);
router.get('/instructors/all', userController.getAllInstructors);

// Admin Routes
router.get('/admin/students', requireAdmin, userController.getAllStudentsForAdmin);
router.get('/admin/instructors', requireAdmin, userController.getAdminInstructors);
router.get(
  '/admin/instructors/:id',
  requireAdmin,
  validate(adminInstructorIdSchema),
  userController.getAdminInstructorDetails
);
router.patch(
  '/admin/instructors/:id/action',
  requireAdmin,
  validate(adminInstructorActionSchema),
  userController.updateAdminInstructor
);

export const UserRoutes = router;
