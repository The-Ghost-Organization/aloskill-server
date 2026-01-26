import { generalLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import express from 'express';
import { userController } from './user.controller.js';
import { getSingleInstructorSchema, getSingleUserSchema } from './user.validation.js';

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.get('/:email', validate(getSingleUserSchema), userController.getUserByEmail);
router.get(
  '/instructor/:id',
  validate(getSingleInstructorSchema),
  userController.getSingleInstructor
);
router.get('/instructors/all', userController.getAllInstructors);

export const UserRoutes = router;
