import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { adminService } from './admin.service.js';

const allApprovals = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Pending approvals retrieved', await adminService.allApprovals(req)); });
const approvalDetail = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Approval details retrieved', await adminService.approvalDetail(req)); });
const decideApproval = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Approval decision saved', await adminService.decideApproval(req)); });
export const adminController = { allApprovals, approvalDetail, decideApproval };
