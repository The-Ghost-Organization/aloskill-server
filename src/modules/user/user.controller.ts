import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { userService } from './user.service.js';

const getUserByEmail = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.getSingleUser(req);
  ResponseHandler.ok(res, 'Login Successful', {
    result,
  });
});

const getAllInstructors = catchAsync(async (_req, res): Promise<void> => {
  const result = await userService.getAllInstructors();

  ResponseHandler.ok(res, 'All Instructors Fetched Successfully', result);
});

const getSingleInstructor = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.getSingleInstructor(req);

  ResponseHandler.ok(res, 'Instructors Fetched Successfully', result);
});

const getStudentSettings = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.getStudentSettings(req);
  ResponseHandler.ok(res, 'Student settings fetched successfully', result);
});

const updateStudentSettings = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.updateStudentSettings(req);
  ResponseHandler.ok(res, 'Student profile updated successfully', result);
});

const changeStudentPassword = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.changeStudentPassword(req);
  ResponseHandler.ok(res, 'Password changed successfully', result);
});

const getStudentDashboard = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.getStudentDashboard(req);
  ResponseHandler.ok(res, 'Student dashboard fetched successfully', result);
});

const getInstructorSettings = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.getInstructorSettings(req);
  ResponseHandler.ok(res, 'Instructor settings fetched successfully', result);
});

const updateInstructorSettings = catchAsync(async (req, res): Promise<void> => {
  await userService.updateInstructorSettings(req);
  const result = await userService.getInstructorSettings(req);
  ResponseHandler.ok(res, 'Instructor profile updated successfully', result);
});

// Admin Controllers

const getAllStudentsForAdmin = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.getAllStudentsForAdmin();
  ResponseHandler.ok(res, 'Students Fetched Successfully for admin', result);
});

const getAdminInstructors = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.getAdminInstructors(req);
  ResponseHandler.ok(res, 'Admin instructors retrieved successfully', result);
});

const getAdminInstructorDetails = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.getAdminInstructorDetails(req);
  ResponseHandler.ok(res, 'Instructor details retrieved successfully', result);
});

const updateAdminInstructor = catchAsync(async (req, res): Promise<void> => {
  const result = await userService.updateAdminInstructor(req);
  ResponseHandler.ok(res, 'Instructor updated successfully', result);
});

export const userController = {
  getUserByEmail,
  getAllInstructors,
  getSingleInstructor,
  getStudentSettings,
  updateStudentSettings,
  changeStudentPassword,
  getStudentDashboard,
  getInstructorSettings,
  updateInstructorSettings,
  getAllStudentsForAdmin,
  getAdminInstructors,
  getAdminInstructorDetails,
  updateAdminInstructor,
};
