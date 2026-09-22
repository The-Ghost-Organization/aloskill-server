import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';

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

const decideApproval = async (req: Request) => executeDbOperation(async prisma => prisma.$transaction(async tx => {
  const admin = await requireAdmin(tx, req.user.email);
  const { type, id } = req.params;
  const { decision, note } = req.body as { decision: 'APPROVE' | 'REJECT'; note: string };
  if (!['book', 'course', 'instructor'].includes(type as string) || !['APPROVE', 'REJECT'].includes(decision) || (decision === 'REJECT' && (!note?.trim() || note.trim().length < 5))) throw new Error('A valid decision and rejection reason (at least 5 characters) are required.');
  const key = id as string;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(key) || (note && (typeof note !== 'string' || note.length > 500))) throw new Error('Invalid approval request.');
  if (type === 'book') {
    const changed = await tx.book.updateMany({ where: { id: key, status: 'PENDING', deletedAt: null }, data: { status: decision === 'APPROVE' ? 'APPROVED' : 'DRAFT', adminNote: note?.trim() || null } });
    if (!changed.count) throw new Error('Book is no longer pending.');
  } else if (type === 'course') {
    // CourseStatus has no REJECTED state: return rejected submissions to DRAFT.
    const changed = await tx.course.updateMany({ where: { id: key, status: 'PENDING', deletedAt: null }, data: { status: decision === 'APPROVE' ? 'PUBLISHED' : 'DRAFT', adminNote: note?.trim() || null } });
    if (!changed.count) throw new Error('Course is no longer pending.');
  } else {
    const profile = await tx.instructorProfile.findFirst({ where: { id: key, status: 'PENDING', deletedAt: null } });
    if (!profile) throw new Error('Instructor is no longer pending.');
    const changed = await tx.instructorProfile.updateMany({ where: { id: key, status: 'PENDING', deletedAt: null }, data: { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', adminNote: note?.trim() || null } });
    if (!changed.count) throw new Error('Instructor is no longer pending.');
    if (decision === 'APPROVE') await tx.userRoleAssignment.createMany({ data: [{ userId: profile.userId, role: 'INSTRUCTOR', grantedById: admin.id }], skipDuplicates: true });
  }
  await tx.auditLog.create({ data: { userId: admin.id, action: `${type.toUpperCase()}_${decision}`, entityType: type.toUpperCase(), entityId: key, changesAfter: { decision, note: note?.trim() || null }, ipAddress: req.ip, userAgent: req.get('user-agent') } });
  return { id: key, type, decision };
}), 'Decide Approval');

export const adminService = { allApprovals, approvalDetail, decideApproval };
