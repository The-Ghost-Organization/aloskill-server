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

export const userController = {
  getUserByEmail,
  getAllInstructors,
  getSingleInstructor,
};
