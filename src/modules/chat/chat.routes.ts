import express from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
import { chatController } from './chat.controller.js';
import { adminMessageSearchSchema, conversationIdSchema, createConversationSchema, sendMessageSchema } from './chat.validation.js';

const router = express.Router({ caseSensitive: true });
router.get('/admin/search', requireAdmin, validate(adminMessageSearchSchema), chatController.adminSearch);
router.get('/admin/conversations/:id', requireAdmin, validate(conversationIdSchema), chatController.adminConversation);
router.get('/contacts', requireAuth, chatController.contacts);
router.get('/conversations', requireAuth, chatController.conversations);
router.post('/conversations', requireAuth, validate(createConversationSchema), chatController.createConversation);
router.get('/conversations/:id/messages', requireAuth, validate(conversationIdSchema), chatController.messages);
router.post('/conversations/:id/messages', requireAuth, validate(sendMessageSchema), chatController.sendMessage);
router.patch('/conversations/:id/read', requireAuth, validate(conversationIdSchema), chatController.markRead);
export const ChatRoutes = router;
