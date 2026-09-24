/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { ApplicationStatus, EnrollmentStatus, OrderStatus, TransactionStatus, UserRole, UserStatus } from '../../generated/client.js';
import { hash } from '../../utils/hashing.js';
import { decryptPhoneNumber, encryptPhoneNumber } from '../../utils/phoneNumber.js';

type DatabaseClient = Parameters<Parameters<typeof executeDbOperation>[0]>[0];
type TransactionArgument = Parameters<DatabaseClient['$transaction']>[0];
type TransactionClient = TransactionArgument extends (tx: infer T) => unknown ? T : never;

const getSingleUser = async (req: Request) => {
  const { email } = req.params;
  if (!email || typeof email !== 'string') {
    throw new Error('Valid Email not provided');
  }

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: { email },
      select: {
        email: true,
        status: true,
        instructorProfile: {
          select: {
            displayName: true,
          },
        },
      },
    });
  });

  if (!user) {
    return {
      canProceed: true,
    };
  }

  if (user.status !== UserStatus.ACTIVE) {
    return {
      canProceed: false,
    };
  }

  if (user.instructorProfile) {
    return {
      canProceed: false,
    };
  }

  return {
    canProceed: true,
  };
};

const getAllUsers = async () => {
  const users = await executeDbOperation(async prisma => {
    return await prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        avatarUrl: true,
        assignedRole: {
          select: {
            role: true,
          },
        },
      },
    });
  }, 'Get all Users');

  return users.map(user => {
    const rolesArray = user.assignedRole.map(value => value.role);
    return {
      id: user.id,
      email: user.email,
      avatarUrl: user.avatarUrl,
      assignedRole: rolesArray,
    };
  });
};

const getSingleInstructor = async (req: Request) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!id || typeof id !== 'string') {
    throw new Error('A valid User ID string must be provided');
  }

  const instructor = await executeDbOperation(async prisma => {
    return await prisma.instructorProfile.findFirst({
      where: {
        userId: id,
        status: ApplicationStatus.APPROVED,
        deletedAt: null,
      },
      select: {
        user: {
          select: {
            id: true,
            avatarUrl: true,
          },
        },
        displayName: true,
        ratingAverage: true,
        totalCourses: true,
        expertise: true,
        bio: true,
        totalStudents: true,
        socialAccount: {
          select: {
            platform: true,
            url: true,
          },
        },
        website: true,
        ownedCourses: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            originalPrice: true,
            discountPrice: true,
            status: true,
            createdAt: true,
            category: {
              select: {
                name: true,
              },
            },
            createdBy: {
              select: {
                displayName: true,
                user: { select: { avatarUrl: true } },
              },
            },
            _count: {
              select: {
                enrollments: true,
                reviews: true,
              },
            },
            modules: {
              select: {
                lessons: {
                  select: {
                    duration: true,
                  },
                },
                _count: {
                  select: {
                    lessons: true,
                  },
                },
              },
            },
            enrollments: {
              where: {
                user: {
                  id: userId as string,
                },
              },
              select: {
                userId: true,
              },
            },
          },
        },
        skills: {
          select: {
            skill: true,
          },
          orderBy: {
            skill: 'asc',
          },
        },
      },
    });
  });

  if (!instructor) {
    throw new Error(`No instructor found with the given ID ${id}`);
  }

  return {
    userId: instructor.user.id,
    avatarUrl: instructor.user.avatarUrl,

    // Instructor Profile fields (flat)
    displayName: instructor.displayName,
    ratingAverage: instructor.ratingAverage ? parseFloat(instructor.ratingAverage.toString()) : 0,
    totalCourses: instructor.totalCourses,
    totalStudents: instructor.totalStudents,
    expertise: instructor.expertise,
    bio: instructor.bio,
    website: instructor.website,
    skills: instructor.skills.map(skillObj => skillObj.skill),
    socialAccounts: instructor.socialAccount,

    // Courses
    // ownedCourses: instructor.ownedCourses.map(course => {
    //   let totalLessonCount = 0;
    //   let totalDurationInMinutes = 0;

    //   course.modules.forEach(module => {
    //     totalLessonCount += module._count.lessons;
    //     // Sum Lesson Durations
    //     module.lessons.forEach(lesson => {
    //       totalDurationInMinutes += lesson.duration ?? 0;
    //     });
    //   });

    //   return {
    //     id: course.id,
    //     title: course.title,
    //     thumbnailUrl: course.thumbnailUrl,
    //     originalPrice: course.originalPrice,
    //     discountPrice: course.discountPrice ?? null,
    //     discountEndDate: course.discountEndDate,
    //     ratingAverage: course.ratingAverage ?? null,
    //     enrollmentCount: course.enrollmentCount,
    //     totalLessonCount,
    //     totalCourseDuration: totalDurationInMinutes,
    //     reviews: course.reviews,
    //   };
    // }),
    ownedCourses: instructor.ownedCourses,
  };
};

const getAllInstructors = async () => {
  const instructors = await executeDbOperation(async prisma => {
    return await prisma.instructorProfile.findMany({
      where: {
        status: ApplicationStatus.APPROVED,
        deletedAt: null,
      },
      select: {
        user: {
          select: {
            avatarUrl: true,
            assignedRole: {
              select: {
                role: true,
              },
            },
          },
        },
        userId: true,
        displayName: true,
        ratingAverage: true,
        totalCourses: true,
        skills: {
          select: {
            skill: true,
          },
          orderBy: {
            skill: 'asc',
          },
        },
      },
      orderBy: {
        ratingAverage: 'desc',
      },
    });
  }, 'Get all Instructors');

  return [
    ...instructors.map(instructor => ({
      id: instructor.userId,
      avatarUrl: instructor.user.avatarUrl,
      role: instructor.user.assignedRole.map(role => role.role),
      skills: instructor.skills.map(s => s.skill),
      displayName: instructor.displayName,
      ratingAverage: instructor.ratingAverage ?? 0,
      totalCourses: instructor.totalCourses,
    })),
  ];
};

// Admin instructor management. Pending and rejected profiles are included so their
// status can be reviewed without relying on demonstration data.
const requireInstructorAdmin = async (tx: TransactionClient, email?: string) => {
  if (!email) {throw new Error('Unauthorized');}
  const admin = await tx.user.findUnique({
    where: { email, deletedAt: null, status: UserStatus.ACTIVE },
    include: { assignedRole: true },
  });
  if (!admin?.assignedRole.some((role: { role: string }) => role.role === UserRole.ADMIN)) {
    throw new Error('Only admins can manage instructors.');
  }
  return admin;
};

const getAdminInstructors = async (req: Request) => await executeDbOperation(async prisma =>
  await prisma.$transaction(async tx => {
    await requireInstructorAdmin(tx, req.user.email);
    const profiles = await tx.instructorProfile.findMany({
      where: { deletedAt: null, user: { deletedAt: null } },
      select: {
        id: true, userId: true, displayName: true, status: true,
        ratingAverage: true, ratingCount: true, createdAt: true,
        user: { select: { email: true, status: true, avatarUrl: true } },
        ownedCourses: {
          where: { deletedAt: null },
          select: {
            id: true,
            _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return profiles.map(({ ownedCourses, ...profile }) => ({
      ...profile,
      courseCount: ownedCourses.length,
      activeEnrollments: ownedCourses.reduce((sum, course) => sum + course._count.enrollments, 0),
      rating: profile.ratingCount ? Number(profile.ratingAverage ?? 0) : null,
    }));
  }), 'Get Admin Instructors');

const getAdminInstructorDetails = async (req: Request) => await executeDbOperation(async prisma =>
  await prisma.$transaction(async tx => {
    await requireInstructorAdmin(tx, req.user.email);
    const profile = await tx.instructorProfile.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      select: {
        id: true, userId: true, displayName: true, status: true, bio: true,
        expertise: true, website: true, adminNote: true, suspendReason: true,
        createdAt: true, ratingAverage: true, ratingCount: true,
        user: { select: { email: true, status: true, avatarUrl: true } },
        authorProfile: { select: { id: true, _count: { select: { books: { where: { deletedAt: null } } } } } },
        ownedCourses: {
          where: { deletedAt: null },
          select: {
            id: true, title: true, slug: true, status: true, views: true,
            enrollments: {
              where: { status: EnrollmentStatus.ACTIVE },
              select: { userId: true },
            },
            reviews: {
              where: { deletedAt: null, flagged: false },
              select: { rating: true },
            },
            OrderItem: {
              where: { order: { status: OrderStatus.PAID } },
              select: { price: true, quantity: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!profile) {throw new Error('Instructor profile not found.');}
    const pendingPayout = await tx.payout.aggregate({
      where: { instructorId: profile.userId, status: 'PENDING', deletedAt: null },
      _sum: { amount: true },
    });
    const courses = profile.ownedCourses.map(course => {
      const reviewCount = course.reviews.length;
      return {
        id: course.id, title: course.title, slug: course.slug, status: course.status,
        views: course.views, activeEnrollments: course.enrollments.length,
        unitsSold: course.OrderItem.reduce((sum, item) => sum + item.quantity, 0),
        paidSales: course.OrderItem.reduce((sum, item) => sum + Number(item.price), 0),
        reviewCount,
        rating: reviewCount ? course.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount : null,
      };
    });
    const reviewCount = courses.reduce((sum, course) => sum + course.reviewCount, 0);
    return {
      id: profile.id, userId: profile.userId, displayName: profile.displayName,
      status: profile.status, bio: profile.bio, expertise: profile.expertise,
      website: profile.website, adminNote: profile.adminNote,
      suspendReason: profile.suspendReason, createdAt: profile.createdAt,
      user: profile.user,
      authorBookCount: profile.authorProfile?._count.books ?? 0,
      stats: {
        courses: courses.length,
        activeEnrollments: courses.reduce((sum, course) => sum + course.activeEnrollments, 0),
        unitsSold: courses.reduce((sum, course) => sum + course.unitsSold, 0),
        paidSales: courses.reduce((sum, course) => sum + course.paidSales, 0),
        views: courses.reduce((sum, course) => sum + course.views, 0),
        reviewCount,
        rating: reviewCount ? courses.reduce((sum, course) => sum + (course.rating ?? 0) * course.reviewCount, 0) / reviewCount : null,
        pendingPayout: Number(pendingPayout._sum.amount ?? 0),
      },
      courses,
    };
  }), 'Get Admin Instructor Details');

const updateAdminInstructor = async (req: Request) => await executeDbOperation(async prisma =>
  await prisma.$transaction(async tx => {
    const admin = await requireInstructorAdmin(tx, req.user.email);
    const { action, note } = req.body as {
      action: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REACTIVATE'; note: string;
    };
    const profile = await tx.instructorProfile.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: { user: { select: { status: true, deletedAt: true, assignedRole: { select: { role: true } } } } },
    });
    if (!profile || profile.user.deletedAt) {throw new Error('Instructor profile not found.');}
    if (action === 'APPROVE' || action === 'REJECT') {
      if (profile.status !== ApplicationStatus.PENDING) {
        throw new Error('Only pending applications can be approved or rejected.');
      }
      await tx.instructorProfile.update({
        where: { id: profile.id },
        data: {
          status: action === 'APPROVE' ? ApplicationStatus.APPROVED : ApplicationStatus.REJECTED,
          adminNote: note,
        },
      });
      if (action === 'APPROVE') {
        await tx.userRoleAssignment.createMany({
          data: [{ userId: profile.userId, role: UserRole.INSTRUCTOR, grantedById: admin.id }],
          skipDuplicates: true,
        });
      }
    } else if (action === 'SUSPEND') {
      if (profile.user.assignedRole.some(role => role.role === UserRole.ADMIN)) {
        throw new Error('An admin account cannot be suspended from instructor management.');
      }
      if (profile.status !== ApplicationStatus.APPROVED || profile.user.status !== UserStatus.ACTIVE) {
        throw new Error('Only active approved instructors can be suspended.');
      }
      await tx.user.update({ where: { id: profile.userId }, data: { status: UserStatus.SUSPENDED } });
      await tx.instructorProfile.update({ where: { id: profile.id }, data: { suspendReason: note, adminNote: note } });
    } else {
      if (profile.status !== ApplicationStatus.APPROVED || profile.user.status !== UserStatus.SUSPENDED) {
        throw new Error('Only suspended approved instructors can be reactivated.');
      }
      await tx.user.update({ where: { id: profile.userId }, data: { status: UserStatus.ACTIVE } });
      await tx.instructorProfile.update({ where: { id: profile.id }, data: { suspendReason: null, adminNote: note } });
    }
    await tx.auditLog.create({
      data: {
        userId: admin.id, action: `INSTRUCTOR_${action}`,
        entityType: 'INSTRUCTOR_PROFILE', entityId: profile.id,
        changesBefore: JSON.parse(JSON.stringify({ status: profile.status, userStatus: profile.user.status })),
        changesAfter: JSON.parse(JSON.stringify({ action, note })),
        ipAddress: req.ip, userAgent: req.get('user-agent'),
      },
    });
    return { id: profile.id, action };
  }), 'Update Admin Instructor');

// For Admin Use Only

const getAllStudentsForAdmin = async () => {
  const students = await executeDbOperation(async prisma => {
    return await prisma.user.findMany({
      where: {
        deletedAt: null,
        assignedRole: {
          some: {
            role: "STUDENT"
          }
        }
      },
      select: {
        studentProfile: {
          where: {
            deletedAt: null,
          },
          select: {
            displayName: true,
            encryptedPhone: true,
          }
        },
        email: true,
        createdAt: true,
        avatarUrl: true,
        status: true,
        _count: {
          select: {
            enrollments: {
              where: {
                status: EnrollmentStatus.ACTIVE
              }
            },
          },
        },
        orders: {
          where: {
            status: OrderStatus.PAID
          },
          select: {
            totalAmount: true,
            orderItems: {
              select: {
                bookId: true
              }
            }
          }
        },
        lessonProgresses: {
          select: {
            completed: true,
          }
        },
      },
    });
  }, 'Get all Students');

  return students.map(student=> ({
    ...student,
    studentProfile: {
      ...student.studentProfile,
      encryptedPhone: decryptPhoneNumber(student.studentProfile?.encryptedPhone as string)
    }
  }));
};

const nonAdminUserWhere = {
  deletedAt: null,
  assignedRole: { none: { role: UserRole.ADMIN } },
};

const safeDecryptPhone = (value?: string | null) => {
  if (!value) {return null;}
  try { return decryptPhoneNumber(value); } catch { return null; }
};

const getAdminUsers = async (req: Request) => await executeDbOperation(async prisma =>
  await prisma.$transaction(async tx => {
    await requireInstructorAdmin(tx, req.user.email);
    const users = await tx.user.findMany({
      where: nonAdminUserWhere,
      select: {
        id: true, email: true, avatarUrl: true, status: true, isEmailVerified: true,
        createdAt: true, lastLogin: true, lastActivityAt: true,
        assignedRole: { select: { role: true } },
        studentProfile: { select: { displayName: true, phoneLastFour: true } },
        instructorProfile: { select: { displayName: true, phoneLastFour: true, status: true, ratingAverage: true, totalCourses: true } },
        _count: { select: { orders: true, enrollments: true } },
        payments: {
          where: { status: TransactionStatus.SUCCEEDED, deletedAt: null },
          select: { amount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ payments, ...user }) => ({
      ...user,
      roles: Array.from(new Set([
        ...user.assignedRole.map(item => item.role),
        ...(user.instructorProfile ? [UserRole.INSTRUCTOR] : []),
      ])),
      displayName: user.studentProfile?.displayName ?? user.instructorProfile?.displayName ?? user.email,
      phoneLastFour: user.studentProfile?.phoneLastFour ?? user.instructorProfile?.phoneLastFour ?? null,
      totalSpent: payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      instructorStatus: user.instructorProfile?.status ?? null,
      instructorRating: user.instructorProfile?.ratingAverage ? Number(user.instructorProfile.ratingAverage) : null,
      instructorCourseCount: user.instructorProfile?.totalCourses ?? 0,
      assignedRole: undefined, studentProfile: undefined, instructorProfile: undefined,
    }));
  }), 'Get Admin Users');

const getAdminUserDetails = async (req: Request) => await executeDbOperation(async prisma =>
  await prisma.$transaction(async tx => {
    await requireInstructorAdmin(tx, req.user.email);
    const user = await tx.user.findFirst({
      where: { id: req.params.id as string, ...nonAdminUserWhere },
      select: {
        id: true, email: true, avatarUrl: true, locale: true, status: true,
        isEmailVerified: true, suspendReason: true, adminNote: true,
        createdAt: true, updatedAt: true, lastLogin: true, lastLoginIP: true, lastActivityAt: true,
        assignedRole: { select: { role: true } },
        studentProfile: { select: { displayName: true, encryptedPhone: true, gender: true, bio: true } },
        instructorProfile: {
          select: {
            id: true, displayName: true, encryptedPhone: true, gender: true, DOB: true,
            nationality: true, address: true, city: true, qualifications: true, experience: true,
            expertise: true, currentOrg: true, proposedCourseCategory: true, courseLevel: true,
            courseType: true, teachingExperience: true, prevTeachingApproach: true, language: true,
            demoVideo: true, bio: true, website: true, status: true, adminNote: true,
            suspendReason: true, ratingAverage: true, ratingCount: true, totalStudents: true,
            totalCourses: true, totalRevenueAmount: true, totalRefunds: true,
            skills: { select: { skill: true } },
            ownedCourses: {
              where: { deletedAt: null },
              select: { id: true, title: true, slug: true, status: true, enrollmentCount: true, ratingAverage: true, totalRevenueAmount: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        orders: {
          select: { id: true, totalAmount: true, status: true, provider: true, createdAt: true, _count: { select: { orderItems: true } } },
          orderBy: { createdAt: 'desc' }, take: 10,
        },
        payments: {
          where: { deletedAt: null },
          select: { id: true, amount: true, currency: true, provider: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 10,
        },
        _count: { select: { orders: true, enrollments: true, reviews: true, wishlists: true, sessions: true } },
      },
    });
    if (!user) {throw new Error('User not found or is an admin account.');}
    return {
      ...user,
      roles: Array.from(new Set([
        ...user.assignedRole.map(item => item.role),
        ...(user.instructorProfile ? [UserRole.INSTRUCTOR] : []),
      ])),
      displayName: user.studentProfile?.displayName ?? user.instructorProfile?.displayName ?? user.email,
      phoneNumber: safeDecryptPhone(user.studentProfile?.encryptedPhone ?? user.instructorProfile?.encryptedPhone),
      studentProfile: user.studentProfile ? { ...user.studentProfile, encryptedPhone: undefined } : null,
      instructorProfile: user.instructorProfile ? {
        ...user.instructorProfile,
        encryptedPhone: undefined,
        teachingExperience: Number(user.instructorProfile.teachingExperience ?? 0),
        ratingAverage: Number(user.instructorProfile.ratingAverage ?? 0),
        totalRevenueAmount: Number(user.instructorProfile.totalRevenueAmount),
        totalRefunds: Number(user.instructorProfile.totalRefunds),
        skills: user.instructorProfile.skills.map(item => item.skill),
        ownedCourses: user.instructorProfile.ownedCourses.map(course => ({
          ...course, ratingAverage: Number(course.ratingAverage ?? 0), totalRevenueAmount: Number(course.totalRevenueAmount),
        })),
      } : null,
      orders: user.orders.map(order => ({ ...order, totalAmount: Number(order.totalAmount) })),
      payments: user.payments.map(payment => ({ ...payment, amount: Number(payment.amount) })),
      assignedRole: undefined,
    };
  }), 'Get Admin User Details');

const createAdminUser = async (req: Request) => await executeDbOperation(async prisma =>
  await prisma.$transaction(async tx => {
    const admin = await requireInstructorAdmin(tx, req.user.email);
    const data = req.body as Record<string, any>;
    const duplicate = await tx.user.findUnique({ where: { email: String(data.email).toLowerCase() } });
    if (duplicate) {throw new Error('A user with this email already exists.');}
    const encryptedPhone = encryptPhoneNumber(data.phoneNumber as string);
    const common = {
      email: String(data.email).toLowerCase(), password: await hash(data.password as string),
      avatarUrl: data.avatarUrl ?? null, isEmailVerified: data.isEmailVerified,
      status: data.isEmailVerified ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION,
      assignedRole: { create: { role: data.role as UserRole, grantedById: admin.id } },
    };
    const user = data.role === UserRole.STUDENT
      ? await tx.user.create({ data: { ...common, studentProfile: { create: {
          displayName: data.displayName, encryptedPhone, phoneLastFour: data.phoneNumber.slice(-4),
          gender: data.gender, bio: data.bio ?? null,
        } } }, select: { id: true, email: true } })
      : await tx.user.create({ data: { ...common, instructorProfile: { create: {
          displayName: data.displayName, DOB: new Date(`${data.DOB}T00:00:00.000Z`), gender: data.gender,
          nationality: data.nationality, encryptedPhone, phoneLastFour: data.phoneNumber.slice(-4),
          address: data.address, city: data.city, qualifications: data.qualifications,
          experience: data.experience, expertise: data.expertise ?? null, currentOrg: data.currentOrg ?? null,
          proposedCourseCategory: data.proposedCourseCategory, courseLevel: data.courseLevel,
          courseType: data.courseType, teachingExperience: data.teachingExperience,
          prevTeachingApproach: data.prevTeachingApproach, language: data.language,
          demoVideo: data.demoVideo ?? null, bio: data.bio, website: data.website ?? null,
          status: data.applicationStatus, skills: { create: data.skills.map((skill: string) => ({ skill })) },
        } } }, select: { id: true, email: true } });
    await tx.auditLog.create({ data: {
      userId: admin.id, action: 'USER_CREATED', entityType: 'USER', entityId: user.id,
      changesAfter: JSON.parse(JSON.stringify({ email: user.email, role: data.role })),
      ipAddress: req.ip, userAgent: req.get('user-agent'),
    } });
    return user;
  }), 'Admin Create User');

const updateAdminUser = async (req: Request) => await executeDbOperation(async prisma =>
  await prisma.$transaction(async tx => {
    const admin = await requireInstructorAdmin(tx, req.user.email);
    const target = await tx.user.findFirst({
      where: { id: req.params.id as string, ...nonAdminUserWhere },
      include: { assignedRole: true, instructorProfile: true },
    });
    if (!target) {throw new Error('User not found or is an admin account.');}
    const { action, note = '' } = req.body as { action: string; note?: string };
    if (action === 'VERIFY_EMAIL') {
      if (target.isEmailVerified) {throw new Error('Email is already verified.');}
      await tx.user.update({ where: { id: target.id }, data: { isEmailVerified: true, status: target.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : target.status, emailVerificationTokenHash: null, emailVerificationExpires: null, adminNote: note || 'Verified by admin' } });
    } else if (action === 'SUSPEND') {
      if (target.status === UserStatus.SUSPENDED) {throw new Error('Account is already suspended.');}
      await tx.user.update({ where: { id: target.id }, data: { status: UserStatus.SUSPENDED, suspendReason: note, adminNote: note } });
      await tx.userSession.updateMany({ where: { userId: target.id, isActive: true }, data: { isActive: false } });
    } else if (action === 'REACTIVATE') {
      if (target.status !== UserStatus.SUSPENDED && target.status !== UserStatus.INACTIVE) {throw new Error('Only suspended or inactive accounts can be reactivated.');}
      await tx.user.update({ where: { id: target.id }, data: { status: target.isEmailVerified ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION, suspendReason: null, adminNote: note || 'Reactivated by admin' } });
    } else {
      if (!target.instructorProfile) {throw new Error('This action requires an instructor profile.');}
      if (target.instructorProfile.status !== ApplicationStatus.PENDING) {throw new Error('Only pending instructor applications can be reviewed.');}
      const approved = action === 'APPROVE_INSTRUCTOR';
      await tx.instructorProfile.update({ where: { id: target.instructorProfile.id }, data: { status: approved ? ApplicationStatus.APPROVED : ApplicationStatus.REJECTED, adminNote: note } });
      if (approved) {
        await tx.userRoleAssignment.createMany({
          data: [{ userId: target.id, role: UserRole.INSTRUCTOR, grantedById: admin.id }],
          skipDuplicates: true,
        });
      }
    }
    await tx.auditLog.create({ data: {
      userId: admin.id, action: `USER_${action}`, entityType: 'USER', entityId: target.id,
      changesBefore: JSON.parse(JSON.stringify({ status: target.status, verified: target.isEmailVerified, instructorStatus: target.instructorProfile?.status })),
      changesAfter: JSON.parse(JSON.stringify({ action, note })), ipAddress: req.ip, userAgent: req.get('user-agent'),
    } });
    return { id: target.id, action };
  }), 'Admin Update User');

export const userService = {
  getSingleUser,
  getAllUsers,
  getAllInstructors,
  getSingleInstructor,
  getAllStudentsForAdmin,
  getAdminInstructors,
  getAdminInstructorDetails,
  updateAdminInstructor,
  getAdminUsers,
  getAdminUserDetails,
  createAdminUser,
  updateAdminUser,
};
