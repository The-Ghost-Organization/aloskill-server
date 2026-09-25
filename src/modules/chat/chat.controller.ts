import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { chatService } from './chat.service.js';

const contacts = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Eligible contacts retrieved', await chatService.listEligibleContacts(req)); });
const createConversation = catchAsync(async (req, res): Promise<void> => { ResponseHandler.created(res, 'Conversation ready', await chatService.createDirectConversation(req)); });
const conversations = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Conversations retrieved', await chatService.listConversations(req)); });
const messages = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Messages retrieved', await chatService.listMessages(req)); });
const sendMessage = catchAsync(async (req, res): Promise<void> => { ResponseHandler.created(res, 'Message sent', await chatService.sendMessage(req)); });
const markRead = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Conversation marked as read', await chatService.markRead(req)); });
const adminSearch = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Message search completed', await chatService.adminSearch(req)); });
const adminConversation = catchAsync(async (req, res): Promise<void> => { ResponseHandler.ok(res, 'Conversation retrieved', await chatService.adminConversation(req)); });

export const chatController = { contacts, createConversation, conversations, messages, sendMessage, markRead, adminSearch, adminConversation };
