import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { notificationService } from '../notification/notification.service.js';

const requireAdmin = async (tx: any, email: string | undefined) => {
  if (!email) throw new Error('Admin access required.');
  const user = await tx.user.findUnique({ where: { email, deletedAt: null, status: 'ACTIVE' }, include: { assignedRole: true } });
  if (!user || !user.assignedRole.some((r: {role: string}) => r.role === 'ADMIN')) throw new Error('Admin access required.');
  return user;
};

const allApprovals = async (req: Request) => executeDbOperation(async prisma => {
  await requireAdmin(prisma, req.user.email);
  const [pendingBooks, pendingInstructors, pendingCourses] = await Promise.all([
    prisma.book.findMany({ where: { status: 'PENDING', deletedAt: null }, select: { id: true, title: true, author: true, createdAt: true, coverImage: true }, orderBy: { createdAt: 'asc' } }),
    prisma.instructorProfile.findMany({ where: { status: 'PENDING', deletedAt: null }, select: { id: true, displayName: true, createdAt: true, user: { select: { email: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.course.findMany({ where: { status: 'PENDING', deletedAt: null }, select: { id: true, title: true, createdAt: true, thumbnailUrl: true, createdBy: { select: { displayName: true } } }, orderBy: { createdAt: 'asc' } }),
  ]);
  return { pendingBooks, pendingInstructors, pendingCourses };
}, 'Fetch Pending Approvals');

const approvalDetail = async (req: Request) => executeDbOperation(async prisma => {
  await requireAdmin(prisma, req.user.email);
  const { type, id } = req.params;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id as string)) throw new Error('Invalid approval ID.');
  if (type === 'book') return prisma.book.findFirst({ where: { id: id as string, status: 'PENDING', deletedAt: null }, include: { files: true, category: true, authorProfile: { include: { instructorProfile: { include: { user: { select: { email: true, avatarUrl: true } } } } } }, owner: { select: { id: true, email: true, avatarUrl: true, instructorProfile: { select: { id: true, displayName: true, bio: true } } } } } });
  if (type === 'course') return prisma.course.findFirst({ where: { id: id as string, status: 'PENDING', deletedAt: null }, include: { category: true, createdBy: { include: { user: { select: { email: true, avatarUrl: true } } } }, courseInstructors: { include: { instructor: { select: { id: true, displayName: true, bio: true } } } }, modules: { where: { deletedAt: null }, orderBy: { position: 'asc' }, include: { lessons: { where: { deletedAt: null }, orderBy: { position: 'asc' }, select: { id: true, title: true, type: true, duration: true, description: true } } } } } });
  if (type === 'instructor') return prisma.instructorProfile.findFirst({ where: { id: id as string, status: 'PENDING', deletedAt: null }, include: { user: { select: { id: true, email: true, avatarUrl: true, status: true } }, skills: true, socialAccount: true, authorProfile: { select: { id: true, name: true, bio: true } } } });
  throw new Error('Unknown approval type.');
}, 'Fetch Approval Details');

const decideApproval = async (req: Request) => {
  const result = await executeDbOperation(async prisma => prisma.$transaction(async tx => {
    const admin = await requireAdmin(tx, req.user.email);
    const { type, id } = req.params;
    const approvalType = String(type);
    const { decision, note } = req.body as { decision: 'APPROVE' | 'REJECT'; note: string };
    if (!['book', 'course', 'instructor'].includes(approvalType) || !['APPROVE', 'REJECT'].includes(decision) || (decision === 'REJECT' && (!note?.trim() || note.trim().length < 5))) throw new Error('A valid decision and rejection reason (at least 5 characters) are required.');
    const key = id as string;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(key) || (note && (typeof note !== 'string' || note.length > 500))) throw new Error('Invalid approval request.');
    let recipientId = '';
    let subject = String(type);
    if (approvalType === 'book') {
      const book = await tx.book.findFirst({ where: { id: key, status: 'PENDING', deletedAt: null }, select: { ownerId: true, title: true } });
      if (!book) throw new Error('Book is no longer pending.');
      recipientId = book.ownerId;
      subject = book.title;
      await tx.book.update({ where: { id: key }, data: { status: decision === 'APPROVE' ? 'APPROVED' : 'DRAFT', adminNote: note?.trim() || null } });
    } else if (approvalType === 'course') {
      const course = await tx.course.findFirst({ where: { id: key, status: 'PENDING', deletedAt: null }, select: { title: true, createdBy: { select: { userId: true } } } });
      if (!course?.createdBy) throw new Error('Course is no longer pending.');
      recipientId = course.createdBy.userId;
      subject = course.title;
      await tx.course.update({ where: { id: key }, data: { status: decision === 'APPROVE' ? 'PUBLISHED' : 'DRAFT', adminNote: note?.trim() || null } });
    } else {
      const profile = await tx.instructorProfile.findFirst({ where: { id: key, status: 'PENDING', deletedAt: null } });
      if (!profile) throw new Error('Instructor is no longer pending.');
      recipientId = profile.userId;
      subject = 'Instructor application';
      await tx.instructorProfile.update({ where: { id: key }, data: { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', adminNote: note?.trim() || null } });
      if (decision === 'APPROVE') await tx.userRoleAssignment.createMany({ data: [{ userId: profile.userId, role: 'INSTRUCTOR', grantedById: admin.id }], skipDuplicates: true });
    }
    await tx.auditLog.create({ data: { userId: admin.id, action: `${approvalType.toUpperCase()}_${decision}`, entityType: approvalType.toUpperCase(), entityId: key, changesAfter: { decision, note: note?.trim() || null }, ipAddress: req.ip, userAgent: req.get('user-agent') } });
    return { id: key, type: approvalType, decision, recipientId, subject, adminId: admin.id, note: note?.trim() || null };
  }), 'Decide Approval');
  await notificationService.create({
    userId: result.recipientId, actorId: result.adminId, type: 'APPROVAL_UPDATE',
    title: `${result.subject} ${result.decision === 'APPROVE' ? 'approved' : 'rejected'}`,
    message: result.note, entityType: result.type.toUpperCase(), entityId: result.id,
    actionUrl: result.type === 'book' ? '/dashboard/instructor/books' : result.type === 'course' ? '/dashboard/instructor/course' : '/dashboard/instructor/settings',
  });
  return { id: result.id, type: result.type, decision: result.decision };
};

const percentageChange = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const startOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const adminCourses = async (req: Request) => executeDbOperation(async prisma => {
  await requireAdmin(prisma, req.user.email);

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const requestedStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const validStatuses = ['DRAFT', 'PENDING', 'PUBLISHED'];
  const status = validStatuses.includes(requestedStatus) ? requestedStatus as 'DRAFT' | 'PENDING' | 'PUBLISHED' : undefined;
  const now = new Date();
  const currentWeek = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const previousWeek = startOfDay(new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));
  const paidStatuses = ['PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

  const where = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(requestedStatus === 'DRAFT' ? { suspendReason: null } : {}),
    ...(requestedStatus === 'SUSPENDED' ? { status: 'DRAFT' as const, suspendReason: { not: null } } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { createdBy: { displayName: { contains: search, mode: 'insensitive' as const } } },
        { category: { name: { contains: search, mode: 'insensitive' as const } } },
      ],
    } : {}),
  };

  const [courses, total, statusGroups] = await Promise.all([
    prisma.course.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ enrollmentCount: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, title: true, slug: true, status: true, suspendReason: true, adminNote: true,
        originalPrice: true, discountPrice: true, currency: true, thumbnailUrl: true,
        ratingAverage: true, ratingCount: true, enrollmentCount: true, views: true,
        totalRevenueAmount: true, createdAt: true, updatedAt: true, level: true, language: true,
        category: { select: { name: true } },
        createdBy: { select: { id: true, displayName: true, user: { select: { email: true, avatarUrl: true } } } },
        _count: { select: { modules: true, reviews: true, wishlistedBy: true } },
        modules: {
          where: { deletedAt: null },
          select: { lessons: { where: { deletedAt: null }, select: { duration: true } } },
        },
        enrollments: {
          where: { deletedAt: null },
          select: { status: true, progress: true, pricePaid: true, startedAt: true, completedAt: true },
        },
        OrderItem: {
          where: { order: { status: { in: [...paidStatuses] } } },
          select: { price: true, quantity: true, createdAt: true },
        },
      },
    }),
    prisma.course.count({ where }),
    prisma.course.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { id: true } }),
  ]);

  const items = courses.map(course => {
    const activeEnrollments = course.enrollments.filter(item => item.status === 'ACTIVE' || item.status === 'COMPLETED');
    const completed = activeEnrollments.filter(item => item.status === 'COMPLETED').length;
    const thisWeek = activeEnrollments.filter(item => item.startedAt >= currentWeek).length;
    const previous = activeEnrollments.filter(item => item.startedAt >= previousWeek && item.startedAt < currentWeek).length;
    const sales = course.OrderItem.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const unitsSold = course.OrderItem.reduce((sum, item) => sum + item.quantity, 0);
    const durationSeconds = course.modules.reduce((sum, module) => sum + module.lessons.reduce((lessonSum, lesson) => lessonSum + Number(lesson.duration ?? 0), 0), 0);
    const lessons = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      status: course.suspendReason ? 'SUSPENDED' : course.status,
      databaseStatus: course.status,
      suspendReason: course.suspendReason,
      adminNote: course.adminNote,
      originalPrice: Number(course.originalPrice),
      discountPrice: course.discountPrice === null ? null : Number(course.discountPrice),
      currency: course.currency ?? 'BDT',
      thumbnailUrl: course.thumbnailUrl,
      ratingAverage: Number(course.ratingAverage ?? 0),
      ratingCount: course.ratingCount,
      enrollments: activeEnrollments.length,
      completed,
      completionRate: activeEnrollments.length ? Number(((completed / activeEnrollments.length) * 100).toFixed(1)) : 0,
      averageProgress: activeEnrollments.length ? Number((activeEnrollments.reduce((sum, item) => sum + Number(item.progress ?? 0), 0) / activeEnrollments.length).toFixed(1)) : 0,
      enrolledThisWeek: thisWeek,
      enrollmentTrend: previous ? Number((((thisWeek - previous) / previous) * 100).toFixed(1)) : thisWeek ? 100 : 0,
      revenue: sales,
      unitsSold,
      views: course.views,
      wishlists: course._count.wishlistedBy,
      modules: course._count.modules,
      lessons,
      durationMinutes: Math.ceil(durationSeconds / 60),
      level: course.level,
      language: course.language,
      category: course.category?.name ?? 'Uncategorised',
      instructor: course.createdBy ? {
        id: course.createdBy.id,
        name: course.createdBy.displayName,
        email: course.createdBy.user.email,
        avatarUrl: course.createdBy.user.avatarUrl,
      } : null,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  });

  const counts = Object.fromEntries(statusGroups.map(item => [item.status, item._count.id]));
  const suspended = await prisma.course.count({ where: { deletedAt: null, status: 'DRAFT', suspendReason: { not: null } } });

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    counts: {
      all: Object.values(counts).reduce((sum, count) => sum + Number(count), 0),
      published: Number(counts.PUBLISHED ?? 0),
      pending: Number(counts.PENDING ?? 0),
      draft: Math.max(0, Number(counts.DRAFT ?? 0) - suspended),
      suspended,
    },
  };
}, 'Fetch Admin Courses');

const adminCourseAction = async (req: Request) => {
  const courseId = String(req.params.courseId ?? '');
  const { action, note } = req.body as { action?: 'PUBLISH' | 'DRAFT' | 'SUSPEND' | 'DELETE'; note?: string };
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(courseId)) throw new Error('Invalid course ID.');
  if (!action || !['PUBLISH', 'DRAFT', 'SUSPEND', 'DELETE'].includes(action)) throw new Error('Invalid course action.');
  if ((action === 'SUSPEND' || action === 'DELETE') && (!note?.trim() || note.trim().length < 5)) {
    throw new Error('A reason of at least 5 characters is required.');
  }

  const result = await executeDbOperation(async prisma => prisma.$transaction(async tx => {
    const admin = await requireAdmin(tx, req.user.email);
    const course = await tx.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { title: true, createdBy: { select: { userId: true } } },
    });
    if (!course) throw new Error('Course not found.');
    const updated = await tx.course.update({
      where: { id: courseId },
      data: action === 'DELETE'
        ? { deletedAt: new Date(), adminNote: note?.trim() }
        : action === 'PUBLISH'
          ? { status: 'PUBLISHED', suspendReason: null, adminNote: note?.trim() || null }
          : action === 'SUSPEND'
            ? { status: 'DRAFT', suspendReason: note!.trim(), adminNote: note!.trim() }
            : { status: 'DRAFT', suspendReason: null, adminNote: note?.trim() || null },
      select: { id: true, status: true, suspendReason: true, deletedAt: true },
    });
    await tx.auditLog.create({ data: {
      userId: admin.id, action: `COURSE_${action}`, entityType: 'COURSE', entityId: courseId,
      changesAfter: { action, note: note?.trim() || null }, ipAddress: req.ip, userAgent: req.get('user-agent'),
    } });
    return { ...updated, title: course.title, recipientId: course.createdBy?.userId, adminId: admin.id };
  }), 'Admin Course Action');

  if (result.recipientId) await notificationService.create({
    userId: result.recipientId, actorId: result.adminId, type: 'APPROVAL_UPDATE',
    title: `${result.title}: ${action.toLowerCase()}`,
    message: note?.trim() || null, entityType: 'COURSE', entityId: courseId,
    actionUrl: '/dashboard/instructor/course',
  });
  return { id: result.id, status: result.suspendReason ? 'SUSPENDED' : result.status, deleted: Boolean(result.deletedAt) };
};

const adminDashboard = async (req: Request) => executeDbOperation(async prisma => {
  await requireAdmin(prisma, req.user.email);

  const now = new Date();
  const currentPeriodStart = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const previousPeriodStart = startOfDay(new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));
  const chartStart = startOfDay(new Date(now.getTime() - 11 * 7 * 24 * 60 * 60 * 1000));
  const paidOrderStatuses = ['PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

  // Keep each batch small. Starting every dashboard query in one Promise.all
  // can exhaust a small/remote PostgreSQL connection pool and cause P1008.
  const [studentCount, newStudents, previousNewStudents, instructorCount, courseCount] =
    await Promise.all([
    prisma.studentProfile.count({ where: { deletedAt: null } }),
    prisma.studentProfile.count({ where: { deletedAt: null, createdAt: { gte: currentPeriodStart } } }),
    prisma.studentProfile.count({ where: { deletedAt: null, createdAt: { gte: previousPeriodStart, lt: currentPeriodStart } } }),
    prisma.instructorProfile.count({ where: { deletedAt: null, status: 'APPROVED' } }),
    prisma.course.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
  ]);

  const [bookCount, orderCount, successfulPayments, currentPayments, previousPayments, refundPayments] =
    await Promise.all([
    prisma.book.count({ where: { deletedAt: null, status: 'APPROVED' } }),
    prisma.order.count(),
    prisma.paymentTransaction.aggregate({
      where: { deletedAt: null, status: 'SUCCEEDED', type: 'PURCHASE' },
      _sum: { amount: true, providerFee: true },
      _count: { id: true },
    }),
    prisma.paymentTransaction.aggregate({
      where: { deletedAt: null, status: 'SUCCEEDED', type: 'PURCHASE', createdAt: { gte: currentPeriodStart } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.paymentTransaction.aggregate({
      where: { deletedAt: null, status: 'SUCCEEDED', type: 'PURCHASE', createdAt: { gte: previousPeriodStart, lt: currentPeriodStart } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.paymentTransaction.aggregate({
      where: { deletedAt: null, status: 'REFUNDED' },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const [paidPayouts, pendingPayouts, ratingAggregate, enrollmentCount, completedEnrollmentCount, physicalStock] =
    await Promise.all([
    prisma.payout.aggregate({
      where: { deletedAt: null, status: 'PAID' },
      _sum: { amount: true, fee: true },
    }),
    prisma.payout.aggregate({
      where: { deletedAt: null, status: 'PENDING' },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.review.aggregate({ where: { deletedAt: null }, _avg: { rating: true }, _count: { id: true } }),
    prisma.enrollment.count({ where: { deletedAt: null, status: { in: ['ACTIVE', 'COMPLETED'] } } }),
    prisma.enrollment.count({ where: { deletedAt: null, status: 'COMPLETED' } }),
    prisma.book.aggregate({
      where: { deletedAt: null, status: 'APPROVED', formats: { has: 'HARDCOVER' } },
      _sum: { stock: true },
    }),
  ]);

  const [lowStockCount, outOfStockCount, pendingBooks, pendingCourses, pendingInstructors, paymentHealth] =
    await Promise.all([
    prisma.book.count({
      where: { deletedAt: null, status: 'APPROVED', formats: { has: 'HARDCOVER' }, stock: { gt: 0, lt: 20 } },
    }),
    prisma.book.count({
      where: { deletedAt: null, status: 'APPROVED', formats: { has: 'HARDCOVER' }, stock: 0 },
    }),
    prisma.book.count({ where: { deletedAt: null, status: 'PENDING' } }),
    prisma.course.count({ where: { deletedAt: null, status: 'PENDING' } }),
    prisma.instructorProfile.count({ where: { deletedAt: null, status: 'PENDING' } }),
    prisma.paymentTransaction.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { id: true },
      _sum: { amount: true },
    }),
  ]);

  const [orderHealth, providerMix, chartPayments, currentSoldItems, previousSoldItems] =
    await Promise.all([
    prisma.order.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.paymentTransaction.groupBy({
      by: ['provider'],
      where: { deletedAt: null, status: 'SUCCEEDED', type: 'PURCHASE' },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.paymentTransaction.findMany({
      where: { deletedAt: null, status: 'SUCCEEDED', type: 'PURCHASE', createdAt: { gte: chartStart } },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orderItem.aggregate({
      where: { order: { status: { in: [...paidOrderStatuses] } }, createdAt: { gte: currentPeriodStart } },
      _sum: { quantity: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: { status: { in: [...paidOrderStatuses] } }, createdAt: { gte: previousPeriodStart, lt: currentPeriodStart } },
      _sum: { quantity: true },
    }),
  ]);

  const [topCourseGroups, topBookGroups, recentTransactions] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ['courseId'],
      where: { courseId: { not: null }, order: { status: { in: [...paidOrderStatuses] } } },
      _sum: { price: true, quantity: true },
      orderBy: { _sum: { price: 'desc' } },
      take: 5,
    }),
    prisma.orderItem.groupBy({
      by: ['bookId'],
      where: { bookId: { not: null }, order: { status: { in: [...paidOrderStatuses] } } },
      _sum: { price: true, quantity: true },
      orderBy: { _sum: { price: 'desc' } },
      take: 5,
    }),
    prisma.paymentTransaction.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        providerTransactionId: true,
        amount: true,
        currency: true,
        provider: true,
        status: true,
        type: true,
        createdAt: true,
        user: { select: { email: true, studentProfile: { select: { displayName: true } }, instructorProfile: { select: { displayName: true } } } },
      },
    }),
  ]);

  const courseIds = topCourseGroups.flatMap(item => item.courseId ? [item.courseId] : []);
  const bookIds = topBookGroups.flatMap(item => item.bookId ? [item.bookId] : []);
  const [topCourses, topBooks, courseRevenueTotal, bookRevenueTotal] = await Promise.all([
    prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, ratingAverage: true, createdBy: { select: { displayName: true } } },
    }),
    prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: { id: true, title: true, author: true, ratings: true },
    }),
    prisma.orderItem.aggregate({
      where: { courseId: { not: null }, order: { status: { in: [...paidOrderStatuses] } } },
      _sum: { price: true },
    }),
    prisma.orderItem.aggregate({
      where: { bookId: { not: null }, order: { status: { in: [...paidOrderStatuses] } } },
      _sum: { price: true },
    }),
  ]);

  const weeklyMap = new Map<string, { revenue: number; payments: number }>();
  for (let index = 0; index < 12; index += 1) {
    const start = new Date(chartStart.getTime() + index * 7 * 24 * 60 * 60 * 1000);
    weeklyMap.set(start.toISOString().slice(0, 10), { revenue: 0, payments: 0 });
  }
  for (const payment of chartPayments) {
    const weekIndex = Math.min(11, Math.max(0, Math.floor((payment.createdAt.getTime() - chartStart.getTime()) / (7 * 24 * 60 * 60 * 1000))));
    const key = new Date(chartStart.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const bucket = weeklyMap.get(key)!;
    bucket.revenue += Number(payment.amount);
    bucket.payments += 1;
  }

  const grossRevenue = Number(successfulPayments._sum.amount ?? 0);
  const refunds = Number(refundPayments._sum.amount ?? 0);
  const payouts = Number(paidPayouts._sum.amount ?? 0);
  const providerFees = Number(successfulPayments._sum.providerFee ?? 0) + Number(paidPayouts._sum.fee ?? 0);
  const netCash = grossRevenue - refunds - payouts - providerFees;
  const currentRevenue = Number(currentPayments._sum.amount ?? 0);
  const previousRevenue = Number(previousPayments._sum.amount ?? 0);
  const successfulCount = successfulPayments._count.id;
  const refundedCount = refundPayments._count.id;

  const courseRevenue = Number(courseRevenueTotal._sum.price ?? 0);
  const bookRevenue = Number(bookRevenueTotal._sum.price ?? 0);
  const courseMap = new Map(topCourses.map(item => [item.id, item]));
  const bookMap = new Map(topBooks.map(item => [item.id, item]));

  return {
    generatedAt: now.toISOString(),
    overview: {
      students: studentCount,
      studentsTrend: percentageChange(newStudents, previousNewStudents),
      instructors: instructorCount,
      courses: courseCount,
      books: bookCount,
      orders: orderCount,
      grossRevenue,
      revenueTrend: percentageChange(currentRevenue, previousRevenue),
      weeklyRevenue: currentRevenue,
      weeklySales: Number(currentSoldItems._sum.quantity ?? 0),
      salesTrend: percentageChange(Number(currentSoldItems._sum.quantity ?? 0), Number(previousSoldItems._sum.quantity ?? 0)),
      averageOrderValue: successfulCount ? grossRevenue / successfulCount : 0,
      netCash,
      refunds,
      refundRate: successfulCount + refundedCount ? (refundedCount / (successfulCount + refundedCount)) * 100 : 0,
      platformRating: Number(ratingAggregate._avg.rating ?? 0),
      reviewCount: ratingAggregate._count.id,
      completionRate: enrollmentCount ? (completedEnrollmentCount / enrollmentCount) * 100 : 0,
    },
    catalog: {
      physicalStock: Number(physicalStock._sum.stock ?? 0),
      lowStockCount,
      outOfStockCount,
      pendingApprovals: pendingBooks + pendingCourses + pendingInstructors,
      pendingBooks,
      pendingCourses,
      pendingInstructors,
    },
    finance: {
      successfulPayments: successfulCount,
      pendingPayoutAmount: Number(pendingPayouts._sum.amount ?? 0),
      pendingPayoutCount: pendingPayouts._count.id,
      providerFees,
    },
    revenueTrend: Array.from(weeklyMap.entries()).map(([week, values]) => ({ week, ...values })),
    revenueSplit: [
      { name: 'Courses', value: courseRevenue },
      { name: 'Books', value: bookRevenue },
    ],
    paymentHealth: paymentHealth.map(item => ({ status: item.status, count: item._count.id, amount: Number(item._sum.amount ?? 0) })),
    orderHealth: orderHealth.map(item => ({ status: item.status, count: item._count.id })),
    providerMix: providerMix.map(item => ({ provider: item.provider, count: item._count.id, amount: Number(item._sum.amount ?? 0) })),
    topCourses: topCourseGroups.map(group => {
      const course = group.courseId ? courseMap.get(group.courseId) : null;
      return {
        id: group.courseId,
        name: course?.title ?? 'Unknown course',
        owner: course?.createdBy?.displayName ?? 'Unassigned',
        units: Number(group._sum.quantity ?? 0),
        revenue: Number(group._sum.price ?? 0),
        rating: Number(course?.ratingAverage ?? 0),
      };
    }),
    topBooks: topBookGroups.map(group => {
      const book = group.bookId ? bookMap.get(group.bookId) : null;
      return {
        id: group.bookId,
        name: book?.title ?? 'Unknown book',
        owner: book?.author ?? 'Unknown author',
        units: Number(group._sum.quantity ?? 0),
        revenue: Number(group._sum.price ?? 0),
        rating: Number(book?.ratings ?? 0),
      };
    }),
    recentTransactions: recentTransactions.map(item => ({
      id: item.id,
      reference: item.providerTransactionId,
      customer: item.user.studentProfile?.displayName ?? item.user.instructorProfile?.displayName ?? item.user.email,
      amount: Number(item.amount),
      currency: item.currency,
      provider: item.provider,
      status: item.status,
      type: item.type,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}, 'Fetch Admin Dashboard');

export const adminService = { allApprovals, approvalDetail, decideApproval, adminDashboard, adminCourses, adminCourseAction };
