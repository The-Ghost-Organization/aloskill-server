import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { courseService } from './course.service.js';

const createCourse = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.createCourse(req);
  ResponseHandler.ok(res, 'Course Created Successfully!', result);
});

const updateCourse = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.updateCourse(req);
  ResponseHandler.ok(res, 'Course Updated Successfully!', result);
});

const getAllCoursesForInstructor = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getAllCoursesForInstructor(req);
  ResponseHandler.ok(res, 'All Courses Fetched Successfully!', result);
});

const getAllCoursesForPublic = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getAllCoursesForPublic(req);
  ResponseHandler.ok(res, 'All Courses Fetched Successfully for Public view!', result);
});

const getSingleCourseForInstructorView = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getSingleCourseForInstructorView(req);
  ResponseHandler.ok(res, 'Course fetched successfully for instructor view!', result);
});

const getSingleCourseForPublicView = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getSingleCourseForPublicView(req);
  ResponseHandler.ok(res, 'Course fetched successfully for Public view!', result);
});

const getSingleCourseForPaidView = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getSingleCourseForPaidView(req);
  ResponseHandler.ok(res, 'Course fetched successfully for Paid view!', result);
});

const getSingleCourseForInstructorEdit = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getSingleCourseForInstructorEdit(req);
  ResponseHandler.ok(res, 'Course fetched successfully for instructor edit!', result);
});

const getCartCourses = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getCartCourses(req);
  ResponseHandler.ok(res, 'Course fetched successfully for Cart view!', result);
});

const getCategories = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getCategories();
  ResponseHandler.ok(res, 'Categories fetched successfully!', result);
});

const checkCourseSlugAvailability = catchAsync(async (req, res): Promise<void> => {
  const { slug } = req.params;
  if (typeof slug !== 'string') {
    ResponseHandler.badRequest(res, 'A valid course slug must be a single string.');
    return;
  }
  const isAvailable = await courseService.isCourseSlugAvailable(slug);

  if (isAvailable) {
    ResponseHandler.ok(res, 'Course slug is available', { canProceed: true });
  } else {
    ResponseHandler.ok(res, 'Course slug is already taken', { canProceed: false });
  }
});

const getCourseInstructors = catchAsync(async (req, res): Promise<void> => {
  const result = (await courseService.getCourseInstructors(req)) as
    | {
        id: string;
        displayName: string;
        user: {
          avatarUrl?: string;
        };
      }[]
    | [];
  ResponseHandler.ok(
    res,
    'Course instructors fetched successfully',
    result.map(user => {
      return {
        userId: user.id,
        displayName: user.displayName,
        avatarUrl: user.user.avatarUrl,
      };
    })
  );
});

const getCourseTags = catchAsync(async (req, res): Promise<void> => {
  const result = (await courseService.getCourseTags(req)) as
    | {
        id: string;
        name: string;
        _count: {
          courses: number;
        };
      }[]
    | [];
  ResponseHandler.ok(
    res,
    'Course instructors fetched successfully',
    result.map(tag => {
      return {
        id: tag.id,
        name: tag.name,
        totalCourses: tag._count.courses,
      };
    })
  );
});

const getBunnySignature = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getBunnySignature(req);
  ResponseHandler.ok(res, 'Bunny signature generated', result);
});

const createFileToBunny = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.createFileToBunny(req);
  ResponseHandler.ok(res, 'File created in bunny storage', result);
});

const getVideo = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.getVideo(req);
  if (result) {
    ResponseHandler.ok(res, 'Video fetched successfully');
  } else {
    ResponseHandler.badRequest(res, 'Something went wrong while fetching video!');
  }
});

const getSecureVideoToken = catchAsync((req, res): void => {
  const result = courseService.getSecureVideoToken(req);
  ResponseHandler.ok(res, 'token generated successfully!', result);
});

const deleteVideo = catchAsync(async (req, res): Promise<void> => {
  const result = await courseService.deleteVideo(req);
  if (result) {
    ResponseHandler.ok(res, 'Video deleted successfully');
  } else {
    ResponseHandler.badRequest(res, 'Something went wrong while deleting video!');
  }
});

export const courseController = {
  getBunnySignature,
  createCourse,
  updateCourse,
  getAllCoursesForInstructor,
  getAllCoursesForPublic,
  getCategories,
  checkCourseSlugAvailability,
  getCourseInstructors,
  getCourseTags,
  createFileToBunny,
  getSingleCourseForInstructorView,
  getSingleCourseForPublicView,
  getSingleCourseForPaidView,
  getSingleCourseForInstructorEdit,
  getCartCourses,
  deleteVideo,
  getVideo,
  getSecureVideoToken,
};
