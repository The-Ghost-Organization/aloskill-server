import { z } from 'zod';

export const createConversationSchema = z.object({
  body: z.object({ participantId: z.uuid() }),
});
export const conversationIdSchema = z.object({ params: z.object({ id: z.uuid() }) });
export const sendMessageSchema = z.object({
  params: z.object({ id: z.uuid() }),
  body: z.object({
    content: z.string().trim().min(1).max(5000).regex(/^[^<>]*$/),
    clientId: z.uuid().optional(),
  }),
});
export const adminMessageSearchSchema = z.object({
  query: z.object({
    q: z.string().trim().min(2).max(100).regex(/^[^<>]*$/),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
