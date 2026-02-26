/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { ApplicationStatus, UserStatus } from '../../generated/client.js';

// const getSingleUser = async (req: Request) => {
//   const data = req.params;
//   if (!data.email) {
//     throw new Error('Email Not provided');
//   }

//   const user = await executeDbOperation(async prisma => {
//     return await prisma.user.findUnique({
//       where: { email: data.email },
//       select: {
//         email: true,
//         status: true,
//         instructorProfile: {
//           select: {
//             displayName: true,
//           },
//         },
//       },
//     });
//   });

//   if (!user) {
//     return {
//       canProceed: true,
//     };
//   }

//   if (user.status !== UserStatus.ACTIVE) {
//     return {
//       canProceed: false,
//     };
//   }

//   if (user.instructorProfile) {
//     return {
//       canProceed: false,
//     };
//   }

//   return {
//     canProceed: true,
//   };
// };

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

export const userService = {
  getSingleUser,
  getAllUsers,
  getAllInstructors,
  getSingleInstructor,
};
