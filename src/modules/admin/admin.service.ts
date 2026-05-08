/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { Prisma } from '../../generated/browser.js';

const allApprovals = async (req: Request) => {
  console.log("calling...");
  const user = req.user;
  if (!user.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const allApproveData = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      const userProfile = await tx.user.findUnique({
        where: { email: user.email, deletedAt: null, status: 'ACTIVE' },
        include: { assignedRole: true },
      });
      if (!userProfile) {
        throw new Error('Unauthorized: User profile not found.');
      }
      const isAuthorized = userProfile.assignedRole.some(r => r.role === 'ADMIN');
      if (!isAuthorized) {
        throw new Error('Security Violation: Only Admins can access approval data.');
      };
      const pendingBooks = await tx.book.findMany({
        where: { status: 'PENDING', deletedAt: null },
      });
      console.log("Pending Books res : ", pendingBooks);
      const pendingInstructors = await tx.instructorProfile.findMany({
        where: { status: 'PENDING', deletedAt: null },
      });
      console.log("Pending Instructors res : ", pendingInstructors);
      const pendingCourses = await tx.course.findMany({
        where: { status: "PENDING", deletedAt: null },
      });
      console.log("Pending Courses res : ", pendingCourses);
      const updatedBooks = await tx.book.findMany({
        where: { status: 'APPROVED', updatedContent: { not: Prisma.JsonNull }, deletedAt: null }
      });
      console.log("Updated Books res : ", updatedBooks);
      const updatedCourse = await tx.course.findMany({
        where: { status: 'PUBLISHED', updatedContent: { not: Prisma.JsonNull }, deletedAt: null }
      });
      console.log("Updated Courses res : ", updatedCourse);
      return { pendingBooks, pendingInstructors, pendingCourses, updatedBooks, updatedCourse };
    });
  }, "Fetch All Approvals");

  return allApproveData;
};

export const adminService = {
  allApprovals,
};
