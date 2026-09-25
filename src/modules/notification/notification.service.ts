import type { Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { realtimeService } from '../../realtime/realtime.service.js';

export type CreateNotificationInput = {
  userId: string;
  type: 'COURSE_UPDATE' | 'NEW_MESSAGE' | 'PAYMENT_SUCCESS' | 'ORDER_UPDATE' | 'APPROVAL_UPDATE' | 'ACCOUNT_UPDATE' | 'SYSTEM_ALERT';
  title: string;
  message?: string | null;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

const requestUser = async (req: Request) => executeDbOperation(prisma => prisma.user.findFirst({
  where: { ...(req.user.id ? { id: req.user.id } : { email: req.user.email }), deletedAt: null },
  select: { id: true },
}), 'Resolve notification user');

const create = async (input: CreateNotificationInput) => {
  const notification = await executeDbOperation(prisma => prisma.notification.create({
    data: { ...input, metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined },
  }), 'Create notification');
  realtimeService.emitToUser(input.userId, 'notification:new', notification);
  return notification;
};

const listMine = async (req: Request) => {
  const user = await requestUser(req);
  if (!user) throw new Error('User not found.');
  const take = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const notifications = await executeDbOperation(prisma => prisma.notification.findMany({
    where: { userId: user.id, isArchived: false },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  }), 'List notifications');
  const hasMore = notifications.length > take;
  const items = hasMore ? notifications.slice(0, take) : notifications;
  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
};

const unreadCount = async (req: Request) => {
  const user = await requestUser(req);
  if (!user) throw new Error('User not found.');
  return executeDbOperation(prisma => prisma.notification.count({ where: { userId: user.id, isRead: false, isArchived: false } }), 'Count unread notifications');
};

const markRead = async (req: Request) => {
  const user = await requestUser(req);
  if (!user) throw new Error('User not found.');
  const result = await executeDbOperation(prisma => prisma.notification.updateMany({
    where: { id: req.params.id as string, userId: user.id }, data: { isRead: true, readAt: new Date() },
  }), 'Mark notification read');
  if (!result.count) throw new Error('Notification not found.');
  realtimeService.emitToUser(user.id, 'notification:read', { id: req.params.id });
  return { id: req.params.id };
};

const markAllRead = async (req: Request) => {
  const user = await requestUser(req);
  if (!user) throw new Error('User not found.');
  await executeDbOperation(prisma => prisma.notification.updateMany({
    where: { userId: user.id, isRead: false }, data: { isRead: true, readAt: new Date() },
  }), 'Mark all notifications read');
  realtimeService.emitToUser(user.id, 'notification:read-all', {});
  return { success: true };
};

export const notificationService = { create, listMine, unreadCount, markRead, markAllRead };
