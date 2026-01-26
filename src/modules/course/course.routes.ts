import { generalLimiter, instructorQueryLimiter } from '../../middleware/security.js';
import { validate } from '../../middleware/validation.js';
import express from 'express';
import multer from 'multer';
import { requireAuth, requireInstructor, requireStudent } from '../../middleware/auth.js';
import { courseController } from './course.controller.js';
import {
  CreateCourseSchema,
  GetAndDeleteVideoSchema,
  GetSecureVideoToken,
} from './course.validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
});

const router = express.Router({ caseSensitive: true });

router.use(generalLimiter);

router.post(
  '/create-course',
  requireInstructor,
  validate(CreateCourseSchema),
  courseController.createCourse
);

router.patch(
  '/editOrUpdate-course',
  requireInstructor,
  validate(CreateCourseSchema),
  courseController.updateCourse
);

router.get('/allCourses', requireInstructor, courseController.getAllCoursesForInstructor);

router.get('/public/allCourses', courseController.getAllCoursesForPublic);

router.get(
  '/course/:courseId',
  requireInstructor,
  courseController.getSingleCourseForInstructorView
);

router.get('/public/viewCourse/:courseId', courseController.getSingleCourseForPublicView);

router.post('/get-cart-courses', requireAuth, courseController.getCartCourses);

router.get(
  '/private/viewCourse/:courseId',
  requireStudent,
  courseController.getSingleCourseForPaidView
);

router.get(
  '/getAndEditCourse/:courseId',
  requireInstructor,
  courseController.getSingleCourseForInstructorEdit
);

router.get('/category', courseController.getCategories);

router.get('/slug-check/:slug', courseController.checkCourseSlugAvailability);

router.get(
  '/instructors',
  instructorQueryLimiter,
  requireInstructor,
  courseController.getCourseInstructors
);

router.get('/tags', instructorQueryLimiter, requireInstructor, courseController.getCourseTags);

router.post('/bunny-signature', requireInstructor, courseController.getBunnySignature);

router.post(
  '/file-upload',
  requireInstructor,
  (req, res, next) => {
    upload.single('file')(req, res, next);
  },
  courseController.createFileToBunny
);

router.get(
  '/get-video',
  requireInstructor,
  validate(GetAndDeleteVideoSchema),
  courseController.getVideo
);

router.post(
  '/get-video-url',
  requireInstructor,
  validate(GetSecureVideoToken),
  courseController.getSecureVideoToken
);

router.delete(
  '/delete-video',
  requireInstructor,
  validate(GetAndDeleteVideoSchema),
  courseController.deleteVideo
);

export const CourseRoutes = router;
