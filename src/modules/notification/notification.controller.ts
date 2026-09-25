import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { notificationService } from './notification.service.js';

const listMine = catchAsync(async (req, res) => ResponseHandler.ok(res, 'Notifications retrieved', await notificationService.listMine(req)));
const unreadCount = catchAsync(async (req, res) => ResponseHandler.ok(res, 'Unread count retrieved', { count: await notificationService.unreadCount(req) }));
const markRead = catchAsync(async (req, res) => ResponseHandler.ok(res, 'Notification marked as read', await notificationService.markRead(req)));
const markAllRead = catchAsync(async (req, res) => ResponseHandler.ok(res, 'Notifications marked as read', await notificationService.markAllRead(req)));

export const notificationController = { listMine, unreadCount, markRead, markAllRead };
