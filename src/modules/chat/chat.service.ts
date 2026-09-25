import type { Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { realtimeService } from '../../realtime/realtime.service.js';
import { notificationService } from '../notification/notification.service.js';

type DbClient = Parameters<Parameters<typeof executeDbOperation>[0]>[0];

const displayNameSelect = {
  id: true, email: true, avatarUrl: true,
  studentProfile: { select: { displayName: true } },
  instructorProfile: { select: { displayName: true } },
  assignedRole: { select: { role: true } },
} as const;

const serializeUser = (user: any) => ({
  id: user.id,
  email: user.email,
  avatarUrl: user.avatarUrl,
  displayName: user.studentProfile?.displayName ?? user.instructorProfile?.displayName ?? user.email,
  roles: user.assignedRole.map((item: { role: string }) => item.role),
});

const currentUser = async (prisma: DbClient, req: Request) => {
  const user = await prisma.user.findFirst({
    where: { ...(req.user.id ? { id: req.user.id } : { email: req.user.email }), deletedAt: null, status: 'ACTIVE' },
    select: displayNameSelect,
  });
  if (!user) throw new Error('Active user account not found.');
  return user;
};

const canMessage = async (prisma: DbClient, firstId: string, secondId: string) => {
  const users = await prisma.user.findMany({
    where: { id: { in: [firstId, secondId] }, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, assignedRole: { select: { role: true } }, instructorProfile: { select: { id: true } } },
  });
  if (users.length !== 2) return false;
  const instructor = users.find(user => user.instructorProfile || user.assignedRole.some(item => item.role === 'INSTRUCTOR'));
  const student = users.find(user => user.id !== instructor?.id && user.assignedRole.some(item => item.role === 'STUDENT'));
  if (!instructor || !student) return false;
  return Boolean(await prisma.enrollment.findFirst({
    where: {
      userId: student.id,
      status: { in: ['ACTIVE', 'COMPLETED'] },
      deletedAt: null,
      course: {
        OR: [
          { createdBy: { userId: instructor.id } },
          { courseInstructors: { some: { instructor: { userId: instructor.id } } } },
        ],
      },
    },
    select: { id: true },
  }));
};

const listEligibleContacts = async (req: Request) => executeDbOperation(async prisma => {
  const me = await currentUser(prisma, req);
  const isInstructor = me.assignedRole.some(item => item.role === 'INSTRUCTOR') || Boolean(me.instructorProfile);
  if (isInstructor) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        status: { in: ['ACTIVE', 'COMPLETED'] }, deletedAt: null,
        course: { OR: [{ createdBy: { userId: me.id } }, { courseInstructors: { some: { instructor: { userId: me.id } } } }] },
      },
      select: { user: { select: displayNameSelect } },
    });
    return Array.from(new Map(enrollments.map(item => [item.user.id, serializeUser(item.user)])).values());
  }
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: me.id, status: { in: ['ACTIVE', 'COMPLETED'] }, deletedAt: null },
    select: {
      course: {
        select: {
          createdBy: { select: { user: { select: displayNameSelect } } },
          courseInstructors: { select: { instructor: { select: { user: { select: displayNameSelect } } } } },
        },
      },
    },
  });
  const contacts = enrollments.flatMap(item => [
    ...(item.course.createdBy?.user ? [item.course.createdBy.user] : []),
    ...item.course.courseInstructors.map(entry => entry.instructor.user),
  ]);
  return Array.from(new Map(contacts.map(user => [user.id, serializeUser(user)])).values());
}, 'List eligible chat contacts');

const createDirectConversation = async (req: Request) => executeDbOperation(async prisma => {
  const me = await currentUser(prisma, req);
  const participantId = req.body.participantId as string;
  if (participantId === me.id) throw new Error('You cannot message yourself.');
  if (!(await canMessage(prisma, me.id, participantId))) throw new Error('Messaging is available only between an instructor and a student enrolled in that instructor’s course.');
  const directKey = [me.id, participantId].sort().join(':');
  const conversation = await prisma.conversation.upsert({
    where: { directKey },
    create: { directKey, participants: { create: [{ userId: me.id }, { userId: participantId }] } },
    update: {},
    select: { id: true },
  });
  return conversation;
}, 'Create direct conversation');

const listConversations = async (req: Request) => executeDbOperation(async prisma => {
  const me = await currentUser(prisma, req);
  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId: me.id, isArchived: false },
    orderBy: { conversation: { lastMessageAt: 'desc' } },
    select: {
      lastReadAt: true,
      conversation: {
        select: {
          id: true, lastMessageAt: true,
          participants: { where: { userId: { not: me.id } }, select: { user: { select: displayNameSelect } } },
          messages: { where: { deletedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, content: true, senderId: true, createdAt: true } },
        },
      },
    },
  });
  return Promise.all(memberships.map(async membership => {
    const conversation = membership.conversation;
    const unreadCount = await prisma.message.count({
      where: { conversationId: conversation.id, senderId: { not: me.id }, deletedAt: null, ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}) },
    });
    return { id: conversation.id, lastMessageAt: conversation.lastMessageAt, participant: conversation.participants[0]?.user ? serializeUser(conversation.participants[0].user) : null, lastMessage: conversation.messages[0] ?? null, unreadCount };
  }));
}, 'List conversations');

const assertMembership = async (prisma: DbClient, conversationId: string, userId: string) => {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  if (!participant) throw new Error('Conversation not found.');
};

const listMessages = async (req: Request) => executeDbOperation(async prisma => {
  const me = await currentUser(prisma, req);
  const conversationId = req.params.id as string;
  await assertMembership(prisma, conversationId, me.id);
  const take = Math.min(50, Math.max(1, Number(req.query.limit ?? 30)));
  const before = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
  if (before && Number.isNaN(before.getTime())) throw new Error('Invalid message cursor.');
  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1,
    select: { id: true, clientId: true, content: true, type: true, senderId: true, createdAt: true, editedAt: true, sender: { select: displayNameSelect } },
  });
  const hasMore = messages.length > take;
  const items = (hasMore ? messages.slice(0, take) : messages).reverse().map(message => ({ ...message, sender: serializeUser(message.sender) }));
  return { items, nextCursor: hasMore ? items[0]?.createdAt.toISOString() ?? null : null };
}, 'List messages');

const sendMessage = async (req: Request) => {
  const result = await executeDbOperation(async prisma => {
    const me = await currentUser(prisma, req);
    const conversationId = req.params.id as string;
    await assertMembership(prisma, conversationId, me.id);
    const content = String(req.body.content).trim();
    const clientId = req.body.clientId as string | undefined;
    if (clientId) {
      const existing = await prisma.message.findUnique({ where: { senderId_clientId: { senderId: me.id, clientId } }, select: { id: true, conversationId: true, content: true, senderId: true, createdAt: true } });
      if (existing) return { message: existing, recipients: [] as Array<{ userId: string; user: { assignedRole: Array<{ role: string }> } }>, recipientIds: [] as string[], sender: serializeUser(me), duplicate: true };
    }
    const created = await prisma.$transaction(async tx => {
      const message = await tx.message.create({ data: { conversationId, senderId: me.id, content, clientId }, select: { id: true, clientId: true, conversationId: true, content: true, type: true, senderId: true, createdAt: true, editedAt: true } });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: message.createdAt } });
      await tx.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: me.id } }, data: { lastReadAt: message.createdAt } });
      return message;
    });
    const recipients = await prisma.conversationParticipant.findMany({ where: { conversationId, userId: { not: me.id } }, select: { userId: true, user: { select: { assignedRole: { select: { role: true } } } } } });
    return { message: created, recipients, recipientIds: recipients.map(item => item.userId), sender: serializeUser(me), duplicate: false };
  }, 'Send message');
  if (!result.duplicate) {
    const payload = { ...result.message, sender: result.sender };
    realtimeService.emitToUsers([result.message.senderId, ...result.recipientIds], 'message:new', payload);
    await Promise.all(result.recipients.map(recipient => notificationService.create({
      userId: recipient.userId, type: 'NEW_MESSAGE', title: `New message from ${result.sender.displayName}`,
      message: result.message.content.slice(0, 160), actorId: result.message.senderId,
      entityType: 'CONVERSATION', entityId: result.message.conversationId,
      actionUrl: `${recipient.user.assignedRole.some(item => item.role === 'INSTRUCTOR') ? '/dashboard/instructor/message' : '/dashboard/student/message'}?conversation=${result.message.conversationId}`,
    })));
  }
  return result.message;
};

const markRead = async (req: Request) => executeDbOperation(async prisma => {
  const me = await currentUser(prisma, req);
  const conversationId = req.params.id as string;
  await assertMembership(prisma, conversationId, me.id);
  const readAt = new Date();
  await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: me.id } }, data: { lastReadAt: readAt } });
  const others = await prisma.conversationParticipant.findMany({ where: { conversationId, userId: { not: me.id } }, select: { userId: true } });
  realtimeService.emitToUsers(others.map(item => item.userId), 'conversation:read', { conversationId, userId: me.id, readAt });
  return { conversationId, readAt };
}, 'Mark conversation read');

const adminSearch = async (req: Request) => executeDbOperation(async prisma => {
  const admin = await currentUser(prisma, req);
  if (!admin.assignedRole.some(item => item.role === 'ADMIN')) throw new Error('Admin access required.');
  const query = String(req.query.q).trim();
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const where = { content: { contains: query, mode: 'insensitive' as const }, deletedAt: null };
  const [total, messages] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      select: {
        id: true, content: true, createdAt: true, conversationId: true,
        sender: { select: displayNameSelect },
        conversation: { select: { participants: { select: { user: { select: displayNameSelect } } } } },
      },
    }),
  ]);
  await prisma.auditLog.create({ data: {
    userId: admin.id, action: 'ADMIN_MESSAGE_SEARCH', entityType: 'MESSAGE', entityId: 'SEARCH',
    changesAfter: { query, resultCount: total, page }, ipAddress: req.ip, userAgent: req.get('user-agent'),
  } });
  return { items: messages.map(message => ({ ...message, sender: serializeUser(message.sender), participants: message.conversation.participants.map(item => serializeUser(item.user)), conversation: undefined })), total, page, pages: Math.ceil(total / limit) };
}, 'Admin search messages');

const adminConversation = async (req: Request) => executeDbOperation(async prisma => {
  const admin = await currentUser(prisma, req);
  if (!admin.assignedRole.some(item => item.role === 'ADMIN')) throw new Error('Admin access required.');
  const conversationId = req.params.id as string;
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, participants: { select: { user: { select: displayNameSelect } } }, messages: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, content: true, senderId: true, createdAt: true, sender: { select: displayNameSelect } } } },
  });
  if (!conversation) throw new Error('Conversation not found.');
  await prisma.auditLog.create({ data: { userId: admin.id, action: 'ADMIN_CONVERSATION_VIEW', entityType: 'CONVERSATION', entityId: conversationId, ipAddress: req.ip, userAgent: req.get('user-agent') } });
  return { ...conversation, participants: conversation.participants.map(item => serializeUser(item.user)), messages: conversation.messages.map(message => ({ ...message, sender: serializeUser(message.sender) })) };
}, 'Admin view conversation');

export const chatService = { listEligibleContacts, createDirectConversation, listConversations, listMessages, sendMessage, markRead, adminSearch, adminConversation };
