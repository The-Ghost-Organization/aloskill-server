/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import {
  ApplicationStatus,
  EnrollmentStatus,
  OrderStatus,
  UserRole,
  UserStatus,
} from '../../generated/client.js';
import { hash, verifyHash } from '../../utils/hashing.js';
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
  if (!email) {
    throw new Error('Unauthorized');
  }
  const admin = await tx.user.findUnique({
    where: { email, deletedAt: null, status: UserStatus.ACTIVE },
    include: { assignedRole: true },
  });
  if (!admin?.assignedRole.some((role: { role: string }) => role.role === UserRole.ADMIN)) {
    throw new Error('Only admins can manage instructors.');
  }
  return admin;
};

const getAdminInstructors = (req: Request) =>
  executeDbOperation(
    prisma =>
      prisma.$transaction(async tx => {
        await requireInstructorAdmin(tx, req.user.email);
        const profiles = await tx.instructorProfile.findMany({
          where: { deletedAt: null, user: { deletedAt: null } },
          select: {
            id: true,
            userId: true,
            displayName: true,
            status: true,
            ratingAverage: true,
            ratingCount: true,
            createdAt: true,
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
          activeEnrollments: ownedCourses.reduce(
            (sum, course) => sum + course._count.enrollments,
            0
          ),
          rating: profile.ratingCount ? Number(profile.ratingAverage ?? 0) : null,
        }));
      }),
    'Get Admin Instructors'
  );

const getAdminInstructorDetails = (req: Request) =>
  executeDbOperation(
    prisma =>
      prisma.$transaction(async tx => {
        await requireInstructorAdmin(tx, req.user.email);
        const profile = await tx.instructorProfile.findFirst({
          where: { id: req.params.id as string, deletedAt: null },
          select: {
            id: true,
            userId: true,
            displayName: true,
            status: true,
            bio: true,
            expertise: true,
            website: true,
            adminNote: true,
            suspendReason: true,
            createdAt: true,
            ratingAverage: true,
            ratingCount: true,
            user: { select: { email: true, status: true, avatarUrl: true } },
            authorProfile: {
              select: { id: true, _count: { select: { books: { where: { deletedAt: null } } } } },
            },
            ownedCourses: {
              where: { deletedAt: null },
              select: {
                id: true,
                title: true,
                slug: true,
                status: true,
                views: true,
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
        if (!profile) {
          throw new Error('Instructor profile not found.');
        }
        const pendingPayout = await tx.payout.aggregate({
          where: { instructorId: profile.userId, status: 'PENDING', deletedAt: null },
          _sum: { amount: true },
        });
        const courses = profile.ownedCourses.map(course => {
          const reviewCount = course.reviews.length;
          return {
            id: course.id,
            title: course.title,
            slug: course.slug,
            status: course.status,
            views: course.views,
            activeEnrollments: course.enrollments.length,
            unitsSold: course.OrderItem.reduce((sum, item) => sum + item.quantity, 0),
            paidSales: course.OrderItem.reduce((sum, item) => sum + Number(item.price), 0),
            reviewCount,
            rating: reviewCount
              ? course.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
              : null,
          };
        });
        const reviewCount = courses.reduce((sum, course) => sum + course.reviewCount, 0);
        return {
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          status: profile.status,
          bio: profile.bio,
          expertise: profile.expertise,
          website: profile.website,
          adminNote: profile.adminNote,
          suspendReason: profile.suspendReason,
          createdAt: profile.createdAt,
          user: profile.user,
          authorBookCount: profile.authorProfile?._count.books ?? 0,
          stats: {
            courses: courses.length,
            activeEnrollments: courses.reduce((sum, course) => sum + course.activeEnrollments, 0),
            unitsSold: courses.reduce((sum, course) => sum + course.unitsSold, 0),
            paidSales: courses.reduce((sum, course) => sum + course.paidSales, 0),
            views: courses.reduce((sum, course) => sum + course.views, 0),
            reviewCount,
            rating: reviewCount
              ? courses.reduce(
                  (sum, course) => sum + (course.rating ?? 0) * course.reviewCount,
                  0
                ) / reviewCount
              : null,
            pendingPayout: Number(pendingPayout._sum.amount ?? 0),
          },
          courses,
        };
      }),
    'Get Admin Instructor Details'
  );

const updateAdminInstructor = (req: Request) =>
  executeDbOperation(
    prisma =>
      prisma.$transaction(async tx => {
        const admin = await requireInstructorAdmin(tx, req.user.email);
        const { action, note } = req.body as {
          action: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REACTIVATE';
          note: string;
        };
        const profile = await tx.instructorProfile.findFirst({
          where: { id: req.params.id as string, deletedAt: null },
          include: {
            user: {
              select: { status: true, deletedAt: true, assignedRole: { select: { role: true } } },
            },
          },
        });
        if (!profile || profile.user.deletedAt) {
          throw new Error('Instructor profile not found.');
        }
        if (action === 'APPROVE' || action === 'REJECT') {
          if (profile.status !== ApplicationStatus.PENDING) {
            throw new Error('Only pending applications can be approved or rejected.');
          }
          await tx.instructorProfile.update({
            where: { id: profile.id },
            data: {
              status:
                action === 'APPROVE' ? ApplicationStatus.APPROVED : ApplicationStatus.REJECTED,
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
          if (
            profile.status !== ApplicationStatus.APPROVED ||
            profile.user.status !== UserStatus.ACTIVE
          ) {
            throw new Error('Only active approved instructors can be suspended.');
          }
          await tx.user.update({
            where: { id: profile.userId },
            data: { status: UserStatus.SUSPENDED },
          });
          await tx.instructorProfile.update({
            where: { id: profile.id },
            data: { suspendReason: note, adminNote: note },
          });
        } else {
          if (
            profile.status !== ApplicationStatus.APPROVED ||
            profile.user.status !== UserStatus.SUSPENDED
          ) {
            throw new Error('Only suspended approved instructors can be reactivated.');
          }
          await tx.user.update({
            where: { id: profile.userId },
            data: { status: UserStatus.ACTIVE },
          });
          await tx.instructorProfile.update({
            where: { id: profile.id },
            data: { suspendReason: null, adminNote: note },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: admin.id,
            action: `INSTRUCTOR_${action}`,
            entityType: 'INSTRUCTOR_PROFILE',
            entityId: profile.id,
            changesBefore: JSON.parse(
              JSON.stringify({ status: profile.status, userStatus: profile.user.status })
            ),
            changesAfter: JSON.parse(JSON.stringify({ action, note })),
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          },
        });
        return { id: profile.id, action };
      }),
    'Update Admin Instructor'
  );

const getStudentSettings = async (req: Request) => {
  const user = req.user;
  if (!user?.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const result = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: { email: user.email, deletedAt: null, status: UserStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        avatarUrl: true,
        studentProfile: {
          select: {
            displayName: true,
            encryptedPhone: true,
            gender: true,
            bio: true,
          },
        },
      },
    });
  }, 'Get Student Settings');

  if (!result?.studentProfile) {
    throw new Error('Student profile not found.');
  }

  return {
    id: result.id,
    email: result.email,
    avatarUrl: result.avatarUrl,
    displayName: result.studentProfile.displayName,
    phoneNumber: decryptPhoneNumber(result.studentProfile.encryptedPhone),
    gender: result.studentProfile.gender,
    bio: result.studentProfile.bio ?? '',
  };
};

const updateStudentSettings = async (req: Request) => {
  const user = req.user;
  if (!user?.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const data = req.body as {
    displayName?: string;
    phoneNumber?: string;
    gender?: 'MALE' | 'FEMALE';
    bio?: string | null;
    avatarUrl?: string | null;
  };

  await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      const existingUser = await tx.user.findUnique({
        where: { email: user.email, deletedAt: null, status: UserStatus.ACTIVE },
        select: { id: true, studentProfile: { select: { id: true } } },
      });

      if (!existingUser?.studentProfile) {
        throw new Error('Student profile not found.');
      }

      const normalizedPhone = data.phoneNumber?.trim();

      await tx.studentProfile.update({
        where: { id: existingUser.studentProfile.id },
        data: {
          ...(data.displayName !== undefined ? { displayName: data.displayName.trim() } : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(data.bio !== undefined ? { bio: data.bio?.trim() ?? null } : {}),
          ...(normalizedPhone
            ? {
                encryptedPhone: encryptPhoneNumber(normalizedPhone),
                phoneLastFour: normalizedPhone.slice(-4),
              }
            : {}),
        },
      });

      if (data.avatarUrl !== undefined) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: { avatarUrl: data.avatarUrl },
        });
      }
    });
  }, 'Update Student Settings');

  return await getStudentSettings(req);
};

const changeStudentPassword = async (req: Request) => {
  const user = req.user;
  if (!user?.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };

  const existingUser = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: { email: user.email, deletedAt: null, status: UserStatus.ACTIVE },
      select: { id: true, password: true, studentProfile: { select: { id: true } } },
    });
  }, 'Get Student for Password Change');

  if (!existingUser?.studentProfile) {
    throw new Error('Student profile not found.');
  }
  if (!existingUser.password) {
    throw new Error('Password change is not available for this social-login account.');
  }

  const matches = await verifyHash(currentPassword, existingUser.password);
  if (!matches) {
    throw new Error('Current password is incorrect.');
  }

  const nextPassword = await hash(newPassword);
  await executeDbOperation(async prisma => {
    return await prisma.user.update({
      where: { id: existingUser.id },
      data: { password: nextPassword, passwordChangedAt: new Date() },
      select: { id: true },
    });
  }, 'Change Student Password');

  return { changed: true };
};

const getStudentDashboard = async (req: Request) => {
  const user = req.user;
  if (!user?.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const successfulOrderStatuses = [
    OrderStatus.PAID,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERED,
  ];

  return await executeDbOperation(async prisma => {
    const account = await prisma.user.findUnique({
      where: { email: user.email, deletedAt: null, status: UserStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        avatarUrl: true,
        studentProfile: { select: { displayName: true } },
      },
    });

    if (!account?.studentProfile) {
      throw new Error('Student profile not found.');
    }

    const [enrollments, purchaseOrders, recentOrders, wishlistCount] = await Promise.all([
      prisma.enrollment.findMany({
        where: {
          userId: account.id,
          deletedAt: null,
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          progress: true,
          startedAt: true,
          completedAt: true,
          course: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              createdBy: { select: { displayName: true } },
            },
          },
        },
      }),
      prisma.order.findMany({
        where: { userId: account.id, status: { in: successfulOrderStatuses } },
        select: {
          id: true,
          totalAmount: true,
          status: true,
          orderItems: {
            select: {
              quantity: true,
              format: true,
              bookId: true,
              courseId: true,
            },
          },
        },
      }),
      prisma.order.findMany({
        where: { userId: account.id, orderItems: { some: {} } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          courierTrackingCode: true,
          orderItems: {
            select: {
              id: true,
              quantity: true,
              format: true,
              book: { select: { title: true } },
              course: { select: { title: true } },
            },
          },
        },
      }),
      prisma.wishlist.count({ where: { userId: account.id } }),
    ]);

    const bookItems = purchaseOrders.flatMap(order =>
      order.orderItems.filter(item => item.bookId !== null)
    );
    const booksPurchased = bookItems.reduce((sum, item) => sum + item.quantity, 0);
    const ebookPurchases = bookItems
      .filter(item => item.format === 'DIGITAL')
      .reduce((sum, item) => sum + item.quantity, 0);
    const physicalBookPurchases = bookItems
      .filter(item => item.format === 'PHYSICAL')
      .reduce((sum, item) => sum + item.quantity, 0);
    const totalSpent = purchaseOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const completedCourses = enrollments.filter(
      item => item.status === EnrollmentStatus.COMPLETED || Number(item.progress ?? 0) >= 100
    ).length;
    const activeCourses = enrollments.filter(
      item => item.status === EnrollmentStatus.ACTIVE && Number(item.progress ?? 0) < 100
    ).length;
    const inTransitStatuses: OrderStatus[] = [
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
    ];
    const inTransitOrders = purchaseOrders.filter(order =>
      inTransitStatuses.includes(order.status)
    ).length;

    return {
      profile: {
        id: account.id,
        email: account.email,
        avatarUrl: account.avatarUrl,
        displayName: account.studentProfile.displayName,
      },
      stats: {
        totalPurchases: enrollments.length + booksPurchased,
        coursesPurchased: enrollments.length,
        booksPurchased,
        ebookPurchases,
        physicalBookPurchases,
        activeCourses,
        completedCourses,
        totalOrders: purchaseOrders.length,
        inTransitOrders,
        wishlistCount,
        totalSpent,
      },
      recentCourses: enrollments.slice(0, 4).map(enrollment => ({
        id: enrollment.course.id,
        title: enrollment.course.title,
        thumbnailUrl: enrollment.course.thumbnailUrl,
        instructorName: enrollment.course.createdBy?.displayName ?? 'AloSkill Instructor',
        status: enrollment.status,
        progress: Number(enrollment.progress ?? 0),
        startedAt: enrollment.startedAt,
        completedAt: enrollment.completedAt,
      })),
      recentOrders: recentOrders.map(order => ({
        ...order,
        totalAmount: Number(order.totalAmount),
        itemCount: order.orderItems.reduce((sum, item) => sum + item.quantity, 0),
        orderItems: order.orderItems.map(item => ({
          id: item.id,
          title: item.book?.title ?? item.course?.title ?? 'Purchase item',
          quantity: item.quantity,
          format: item.format,
        })),
      })),
    };
  }, 'Get Student Dashboard');
};

const getInstructorSettings = async (req: Request) => {
  const user = req.user;
  if (!user?.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const result = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: { email: user.email, deletedAt: null },
      select: {
        id: true,
        email: true,
        avatarUrl: true,
        instructorProfile: {
          select: {
            id: true,
            displayName: true,
            encryptedPhone: true,
            expertise: true,
            bio: true,
            website: true,
            qualifications: true,
            currentOrg: true,
            experience: true,
            address: true,
            city: true,
            nationality: true,
            socialAccount: {
              select: { platform: true, url: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
  }, 'Get Instructor Settings');

  if (!result?.instructorProfile) {
    throw new Error('Instructor profile not found.');
  }

  return {
    id: result.id,
    email: result.email,
    avatarUrl: result.avatarUrl,
    displayName: result.instructorProfile.displayName,
    phoneNumber: decryptPhoneNumber(result.instructorProfile.encryptedPhone),
    expertise: result.instructorProfile.expertise,
    bio: result.instructorProfile.bio,
    website: result.instructorProfile.website,
    qualifications: result.instructorProfile.qualifications,
    currentOrg: result.instructorProfile.currentOrg,
    experience: result.instructorProfile.experience,
    address: result.instructorProfile.address,
    city: result.instructorProfile.city,
    nationality: result.instructorProfile.nationality,
    socialAccounts: result.instructorProfile.socialAccount,
  };
};

const updateInstructorSettings = async (req: Request) => {
  const user = req.user;
  if (!user?.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const data = req.body as {
    displayName?: string;
    phoneNumber?: string;
    expertise?: string | null;
    bio?: string;
    website?: string | null;
    avatarUrl?: string | null;
    qualifications?: string;
    currentOrg?: string | null;
    experience?: number;
    address?: string;
    city?: string;
    nationality?: string;
    socialAccounts?: Array<{
      platform: 'FACEBOOK' | 'TWITTER' | 'INSTAGRAM' | 'LINKEDIN' | 'YOUTUBE';
      url: string;
    }>;
  };

  const updated = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      const existingUser = await tx.user.findUnique({
        where: { email: user.email, deletedAt: null },
        select: {
          id: true,
          instructorProfile: {
            select: { id: true },
          },
        },
      });

      if (!existingUser?.instructorProfile) {
        throw new Error('Instructor profile not found.');
      }

      const instructorId = existingUser.instructorProfile.id;
      const normalizedPhone = data.phoneNumber?.trim();

      await tx.instructorProfile.update({
        where: { id: instructorId },
        data: {
          ...(data.displayName !== undefined ? { displayName: data.displayName.trim() } : {}),
          ...(data.expertise !== undefined ? { expertise: data.expertise?.trim() ?? null } : {}),
          ...(data.bio !== undefined ? { bio: data.bio.trim() } : {}),
          ...(data.website !== undefined ? { website: data.website?.trim() ?? null } : {}),
          ...(data.qualifications !== undefined
            ? { qualifications: data.qualifications.trim() }
            : {}),
          ...(data.currentOrg !== undefined ? { currentOrg: data.currentOrg?.trim() ?? null } : {}),
          ...(data.experience !== undefined ? { experience: data.experience } : {}),
          ...(data.address !== undefined ? { address: data.address.trim() } : {}),
          ...(data.city !== undefined ? { city: data.city.trim() } : {}),
          ...(data.nationality !== undefined ? { nationality: data.nationality.trim() } : {}),
          ...(normalizedPhone
            ? {
                encryptedPhone: encryptPhoneNumber(normalizedPhone),
                phoneLastFour: normalizedPhone.slice(-4),
              }
            : {}),
        },
      });

      if (data.avatarUrl !== undefined) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: { avatarUrl: data.avatarUrl },
        });
      }

      if (data.socialAccounts !== undefined) {
        await tx.socialLink.deleteMany({ where: { userId: instructorId } });
        if (data.socialAccounts.length > 0) {
          await tx.socialLink.createMany({
            data: data.socialAccounts.map(account => ({
              userId: instructorId,
              platform: account.platform,
              url: account.url,
            })),
          });
        }
      }

      // Keep the linked Author Profile in sync with the instructor's public identity.
      const authorProfile = await tx.bookAuthor.findUnique({
        where: { instructorProfileId: instructorId },
        select: { id: true },
      });

      if (authorProfile) {
        await tx.bookAuthor.update({
          where: { id: authorProfile.id },
          data: {
            ...(data.displayName !== undefined ? { name: data.displayName.trim() } : {}),
            ...(data.bio !== undefined ? { bio: data.bio.trim() } : {}),
            ...(data.website !== undefined ? { websiteUrl: data.website?.trim() ?? null } : {}),
            ...(data.avatarUrl !== undefined ? { photoUrl: data.avatarUrl } : {}),
          },
        });
      }

      return existingUser.id;
    });
  }, 'Update Instructor Settings');

  return updated;
};
// For Admin Use Only

const getAllStudentsForAdmin = async () => {
  const students = await executeDbOperation(async prisma => {
    return await prisma.user.findMany({
      where: {
        deletedAt: null,
        assignedRole: {
          some: {
            role: 'STUDENT',
          },
        },
      },
      select: {
        studentProfile: {
          where: {
            deletedAt: null,
          },
          select: {
            displayName: true,
            encryptedPhone: true,
          },
        },
        email: true,
        createdAt: true,
        avatarUrl: true,
        status: true,
        _count: {
          select: {
            enrollments: {
              where: {
                status: EnrollmentStatus.ACTIVE,
              },
            },
          },
        },
        orders: {
          where: {
            status: OrderStatus.PAID,
          },
          select: {
            totalAmount: true,
            orderItems: {
              select: {
                bookId: true,
              },
            },
          },
        },
        lessonProgresses: {
          select: {
            completed: true,
          },
        },
      },
    });
  }, 'Get all Students');

  return students.map(student => ({
    ...student,
    studentProfile: {
      ...student.studentProfile,
      encryptedPhone: decryptPhoneNumber(student.studentProfile?.encryptedPhone as string),
    },
  }));
};

export const userService = {
  getSingleUser,
  getAllUsers,
  getAllInstructors,
  getSingleInstructor,
  getStudentSettings,
  updateStudentSettings,
  changeStudentPassword,
  getStudentDashboard,
  getInstructorSettings,
  updateInstructorSettings,
  getAllStudentsForAdmin,
  getAdminInstructors,
  getAdminInstructorDetails,
  updateAdminInstructor,
};
