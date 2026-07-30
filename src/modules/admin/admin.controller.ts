import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { adminService } from './admin.service.js';

const allApprovals = catchAsync(async (req, res): Promise<void> => {
  const result = await adminService.allApprovals(req);
  console.log("result in allapprovals : ", result);
  ResponseHandler.ok(res, 'All Approvals Retrieved Successfully!', result);
});


export const adminController = {
  allApprovals,
};
