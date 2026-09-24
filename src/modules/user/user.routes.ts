import { generalLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import express from 'express';
import { userController } from './user.controller.js';
import { adminCreateUserSchema, adminInstructorActionSchema, adminInstructorIdSchema, adminUserActionSchema, adminUserIdSchema, getSingleInstructorSchema, getSingleUserSchema } from './user.validation.js';
import { requireAdmin } from '../../middleware/auth.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.get('/:email', validate(getSingleUserSchema), userController.getUserByEmail);
router.get(
  '/instructor/:id',
  validate(getSingleInstructorSchema),
  userController.getSingleInstructor
);
router.get('/instructors/all', userController.getAllInstructors);

// Admin Routes
router.get('/admin/users', requireAdmin, userController.getAdminUsers);
router.post('/admin/users', requireAdmin, validate(adminCreateUserSchema), userController.createAdminUser);
router.get('/admin/users/:id', requireAdmin, validate(adminUserIdSchema), userController.getAdminUserDetails);
router.patch('/admin/users/:id/action', requireAdmin, validate(adminUserActionSchema), userController.updateAdminUser);
router.get('/admin/students', requireAdmin, userController.getAllStudentsForAdmin);
router.get('/admin/instructors', requireAdmin, userController.getAdminInstructors);
router.get('/admin/instructors/:id', requireAdmin, validate(adminInstructorIdSchema), userController.getAdminInstructorDetails);
router.patch('/admin/instructors/:id/action', requireAdmin, validate(adminInstructorActionSchema), userController.updateAdminInstructor);

export const UserRoutes = router;
