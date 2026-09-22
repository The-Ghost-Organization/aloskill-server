/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import {
  ApplicationStatus,
  EnrollmentStatus,
  OrderStatus,
  UserStatus,
} from '../../generated/client.js';
import { decryptPhoneNumber, encryptPhoneNumber } from '../../utils/phoneNumber.js';

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
          ...(data.expertise !== undefined ? { expertise: data.expertise?.trim() } : {}),
          ...(data.bio !== undefined ? { bio: data.bio.trim() } : {}),
          ...(data.website !== undefined ? { website: data.website?.trim() } : {}),
          ...(data.qualifications !== undefined
            ? { qualifications: data.qualifications.trim() }
            : {}),
          ...(data.currentOrg !== undefined ? { currentOrg: data.currentOrg?.trim() } : {}),
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
            ...(data.website !== undefined ? { websiteUrl: data.website?.trim() } : {}),
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
  getInstructorSettings,
  updateInstructorSettings,
  getAllStudentsForAdmin,
};
