/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import crypto from 'crypto';
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { config } from '../../config/env.js';
import {
  ApplicationStatus,
  CourseStatus,
  EnrollmentStatus,
  OrderStatus,
  PaymentStatus,
  QuestionType,
  UserStatus,
} from '../../generated/client.js';
import type { CreateCoursePayload } from './course.validation.js';

const getCategories = async () => {
  const categories = await executeDbOperation(async prisma => {
    return await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        parentId: true,
        children: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  });

  return categories;
};

const isCourseSlugAvailable = async (slug: string) => {
  const slugify = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const course = await executeDbOperation(async prisma => {
    return await prisma.course.findUnique({
      where: {
        slug: slugify(slug),
      },
      select: {
        id: true,
      },
    });
  });

  return course ? false : true;
};

const getCourseInstructors = async (req: Request) => {
  const query = req.query.instructor;
  if (!query || typeof query !== 'string') {
    throw new Error('Invalid Instructor Query Parameter');
  }

  if (query.length < 2) {
    return [];
  }
  const instructors = await executeDbOperation(async prisma => {
    return await prisma.instructorProfile.findMany({
      where: {
        displayName: { contains: query },
        status: ApplicationStatus.APPROVED,
        deletedAt: null,
      },
      select: {
        id: true,
        displayName: true,
        user: {
          select: {
            avatarUrl: true,
          },
        },
      },
      take: 5,
      orderBy: { displayName: 'asc' },
    });
  });

  return instructors;
};

const getCourseTags = async (req: Request) => {
  const query = req.query.tag;
  if (!query || typeof query !== 'string') {
    throw new Error('Invalid Instructor Tags Parameter');
  }

  if (query.length < 2) {
    return [];
  }

  const tags = await executeDbOperation(async prisma => {
    return await prisma.tag.findMany({
      where: {
        name: { contains: query },
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            courses: true,
          },
        },
      },
      orderBy: {
        courses: {
          _count: 'asc',
        },
      },
    });
  });

  return tags;
};

const createCourse = async (req: Request) => {
  const data = req.body as CreateCoursePayload['body'];
  const instructorEmail = req.query.user as string;

  if (data.modules.length === 0) {
    throw new Error('Invalid course data provided');
  }
  if (data.modules[0]?.lessons.length === 0) {
    throw new Error('Lessons not provided');
  }
  if (!instructorEmail) {
    throw new Error('No instructor found in request');
  }

  const instructorExists = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        email: instructorEmail,
        status: UserStatus.ACTIVE,
        instructorProfile: { status: ApplicationStatus.APPROVED },
      },
      select: { instructorProfile: { select: { id: true } } },
    });
  });

  if (!instructorExists?.instructorProfile) {
    throw new Error(`Instructor profile not found or not approvedAt`);
  }

  const primaryInstructorId = instructorExists.instructorProfile.id;

  const { id: _id, modules, courseInstructors, ...restData } = data;
  const { category, subCategory, tags, ...courseData } = restData;

  const categoryData = await executeDbOperation(async prisma => {
    const categoryRecord = await prisma.category.findFirst({
      where: { name: category },
      select: { id: true },
    });
    if (!categoryRecord) {
      throw new Error(`Category '${data.category}' does not exist`);
    }

    if (data.subCategory) {
      const subCategoryRecord = await prisma.category.findFirst({
        where: { name: subCategory, parentId: categoryRecord.id },
        select: { id: true },
      });
      if (!subCategoryRecord) {
        throw new Error(
          `SubCategory '${data.subCategory}' does not exist under '${data.category}'`
        );
      }
      return subCategoryRecord;
    }
    return categoryRecord;
  });

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const originalPrice = data.originalPrice ?? 0;
  const discountPrice = data.discountPrice ?? 0;

  let discountPercent = 0;
  if (originalPrice > 0 && discountPrice > 0) {
    discountPercent = Math.round(((originalPrice - discountPrice) / originalPrice) * 100);
  }

  const isDiscountActive = data.discountEndDate
    ? new Date(data.discountEndDate) > new Date()
    : false;

  const course = await executeDbOperation(async prisma => {
    return await prisma.course.create({
      data: {
        ...courseData,
        originalPrice,
        discountPrice,
        discountPercent,
        isDiscountActive,
        moduleCount: modules.length,
        slug: slugify(data.slug),
        categoryId: categoryData.id,
        status: data.status === 'DRAFT' ? CourseStatus.DRAFT : CourseStatus.PUBLISHED,
        createdById: primaryInstructorId,

        courseInstructors: {
          createMany: {
            data: [
              { instructorId: primaryInstructorId, role: 'PRIMARY' },
              ...(courseInstructors
                ?.filter(inst => inst.instructorId !== primaryInstructorId)
                .map(inst => ({
                  instructorId: inst.instructorId,
                  role: 'CO_INSTRUCTOR' as const,
                })) ?? []),
            ],
          },
        },

        tags: {
          create: tags.map((tagName: string) => ({
            tag: {
              connectOrCreate: {
                where: { name: tagName.trim() },
                create: { name: tagName.trim(), slug: slugify(tagName) },
              },
            },
          })),
        },

        modules: {
          create: modules.map(moduleData => ({
            title: moduleData.title,
            position: moduleData.position,
            lessons: {
              create: moduleData.lessons.map(lesson => {
                const lessonCreateInput: any = {
                  title: lesson.title,
                  position: lesson.position,
                  type: lesson.type,
                  description: lesson.description,
                  contentUrl: lesson.contentUrl?.url,
                  contentName: lesson.contentUrl?.name,
                  notes: lesson.notes,
                  duration: lesson.type === 'QUIZ' ? lesson.quiz?.duration : lesson.duration,
                  files: {
                    create: lesson.files?.map(file => ({ url: file.url, name: file.name })),
                  },
                };

                if (lesson.quiz) {
                  lessonCreateInput.quiz = {
                    create: {
                      title: lesson.quiz.title,
                      description: lesson.quiz.description,
                      passingScore: lesson.quiz.passingScore,
                      attemptsAllowed: lesson.quiz.attemptsAllowed,
                      duration: lesson.quiz.duration ?? 0,
                      questions: {
                        create: lesson.quiz.questions.map((q: any) => ({
                          text: q.text,
                          position: q.position,
                          points: q.points,
                          type:
                            q.type === 'TRUE_FALSE'
                              ? QuestionType.TRUE_FALSE
                              : q.type === 'SINGLE_CHOICE'
                                ? QuestionType.SINGLE_CHOICE
                                : 'MULTIPLE_CHOICE',
                          options: {
                            create: q.options.map((opt: any) => ({
                              text: opt.text,
                              isCorrect: opt.isCorrect,
                              position: opt.position,
                            })),
                          },
                        })),
                      },
                    },
                  };
                }
                return lessonCreateInput;
              }),
            },
          })),
        },
      },
      select: {
        id: true,
      },
    });
  });

  return course;
};

const updateCourse = async (req: Request) => {
  const data = req.body as CreateCoursePayload['body'];
  const instructorEmail = req.query.user as string;

  if (!data.id) {
    throw new Error('Course ID Not found');
  }
  if (data.modules.length === 0) {
    throw new Error('Invalid course data provided');
  }
  if (data.modules[0]?.lessons.length === 0) {
    throw new Error('Lessons not provided');
  }

  const instructorExists = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        email: instructorEmail,
        status: UserStatus.ACTIVE,
        instructorProfile: { status: ApplicationStatus.APPROVED },
      },
      select: { instructorProfile: { select: { id: true } } },
    });
  });

  if (!instructorExists?.instructorProfile) {
    throw new Error(`Instructor profile not found for Editing the course`);
  }

  const primaryInstructorId = instructorExists.instructorProfile.id;

  const { id, modules, courseInstructors, ...restData } = data;
  const { category, subCategory, tags, ...courseData } = restData;

  const categoryData = await executeDbOperation(async prisma => {
    const categoryRecord = await prisma.category.findFirst({
      where: { name: category },
      select: { id: true },
    });
    if (!categoryRecord) {
      throw new Error(`Category '${data.category}' does not exist`);
    }

    if (data.subCategory) {
      const subCategoryRecord = await prisma.category.findFirst({
        where: { name: subCategory, parentId: categoryRecord.id },
        select: { id: true },
      });
      if (!subCategoryRecord) {
        throw new Error(
          `SubCategory '${data.subCategory}' does not exist under '${data.category}'`
        );
      }
      return subCategoryRecord;
    }
    return categoryRecord;
  });

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const originalPrice = data.originalPrice ?? 0;
  const discountPrice = data.discountPrice ?? 0;

  let discountPercent = 0;
  if (originalPrice > 0 && discountPrice > 0) {
    discountPercent = Math.round(((originalPrice - discountPrice) / originalPrice) * 100);
  }

  const isDiscountActive = data.discountEndDate
    ? new Date(data.discountEndDate) > new Date()
    : false;

  const updatedCourseValue = await executeDbOperation(async prisma => {
    const existingCourse = await prisma.course.findUnique({
      where: { id: data.id as string },
    });

    if (!existingCourse) {
      throw new Error('Course not found');
    }

    return await prisma.$transaction(async tx => {
      const updatedCourse = await tx.course.update({
        where: { id },
        data: {
          ...courseData,
          title: data.title,
          slug: slugify(data.slug),
          description: data.description,
          welcomeMessage: data.welcomeMessage,
          congratulationsMessage: data.congratulationsMessage,
          originalPrice: data.originalPrice,
          discountPrice: data.discountPrice,
          discountEndDate: data.discountEndDate ? new Date(data.discountEndDate) : null,
          discountPercent,
          isDiscountActive,
          language: data.language,
          level: data.level,
          thumbnailUrl: data.thumbnailUrl,
          trailerUrl: data.trailerUrl,
          categoryId: categoryData.id,

          tags: {
            deleteMany: {},
            create: tags.map((tagName: string) => ({
              tag: {
                connectOrCreate: {
                  where: { name: tagName.trim() },
                  create: { name: tagName.trim(), slug: slugify(tagName) },
                },
              },
            })),
          },

          courseInstructors: {
            deleteMany: {},
            createMany: {
              data: [
                { instructorId: primaryInstructorId, role: 'PRIMARY' },
                ...(courseInstructors
                  ?.filter(inst => inst.instructorId !== primaryInstructorId)
                  .map(inst => ({
                    instructorId: inst.instructorId,
                    role: 'CO_INSTRUCTOR' as const,
                  })) ?? []),
              ],
            },
          },
        },
        select: {
          id: true,
        },
      });

      await tx.module.deleteMany({ where: { courseId: id } });

      for (const [_index, module] of modules.entries()) {
        await tx.module.create({
          data: {
            courseId: id,
            title: module.title,
            position: module.position,
            lessons: {
              create: module.lessons.map((lesson: any) => ({
                title: lesson.title,
                position: lesson.position,
                type: lesson.type,
                description: lesson.description,
                notes: lesson.notes,
                contentUrl: lesson.contentUrl?.url,
                contentName: lesson.contentUrl?.name,
                duration: lesson.type === 'QUIZ' ? lesson.quiz?.duration : lesson.duration,
                files: {
                  create: lesson.files?.map((file: { url: string; name: string }) => ({
                    url: file.url,
                    name: file.name,
                  })),
                },
                quiz: lesson.quiz
                  ? {
                      create: {
                        title: lesson.quiz.title,
                        description: lesson.quiz.description,
                        passingScore: lesson.quiz.passingScore,
                        attemptsAllowed: lesson.quiz.attemptsAllowed,
                        questions: {
                          create: lesson.quiz.questions.map((q: any) => ({
                            text: q.text,
                            type:
                              q.type === 'TRUE_FALSE'
                                ? QuestionType.TRUE_FALSE
                                : q.type === 'SINGLE_CHOICE'
                                  ? QuestionType.SINGLE_CHOICE
                                  : 'MULTIPLE_CHOICE',
                            points: q.points,
                            position: q.position,
                            options: {
                              create: q.options.map((o: any) => ({
                                text: o.text,
                                isCorrect: o.isCorrect,
                                position: o.position,
                              })),
                            },
                          })),
                        },
                      },
                    }
                  : undefined,
              })),
            },
          },
        });
      }

      return updatedCourse;
    });
  }, 'Update Course Strategy');

  return updatedCourseValue;
};

const getAllCoursesForInstructor = async (req: Request) => {
  const userId = req.query.userId as string;
  if (!userId) {
    throw new Error('User Not Provided');
  }

  const userExist = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        id: userId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: {
        instructorProfile: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });
  }, 'Find User in GetAllCourses');

  if (!userExist) {
    throw new Error('User Doesnt Exist');
  }
  if (userExist.instructorProfile === null) {
    throw new Error('User Is Not An Instructor');
  }
  if (userExist.instructorProfile.deletedAt !== null) {
    throw new Error('User Has Been Deleted');
  }
  if (userExist.instructorProfile.status !== ApplicationStatus.APPROVED) {
    throw new Error('User Is Not Approved Yet or rejected');
  }

  const getCourses = await executeDbOperation(async prisma => {
    return await prisma.course.findMany({
      where: {
        OR: [
          { createdById: userExist.instructorProfile?.id },
          {
            courseInstructors: {
              some: {
                instructorId: userExist.instructorProfile?.id,
              },
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        originalPrice: true,
        discountPrice: true,
        status: true,
        createdAt: true,
        createdBy: {
          select: {
            displayName: true,
            user: { select: { avatarUrl: true } },
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        courseInstructors: {
          where: { instructorId: userExist.instructorProfile?.id },
          select: { role: true },
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
      },
    });
  }, 'Get All Associated Courses');

  if (getCourses.length === 0) {
    throw new Error('No Courses Found');
  }
  return getCourses;
};

const getAllCoursesForStudent = async (req: Request) => {
  const requestedUserId = req.query.userId as string | undefined;
  const authenticatedEmail = req.user?.email;

  if (!authenticatedEmail) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.findFirst({
      where: {
        email: authenticatedEmail,
        ...(requestedUserId ? { id: requestedUserId } : {}),
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        studentProfile: {
          select: {
            id: true,
            deletedAt: true,
          },
        },
      },
    });
  }, 'Find student for enrolled courses');

  if (!user) {
    throw new Error('User does not exist.');
  }
  if (user.studentProfile?.deletedAt !== null) {
    throw new Error('Student profile not found.');
  }

  const courses = await executeDbOperation(async prisma => {
    return await prisma.course.findMany({
      where: {
        enrollments: {
          some: {
            userId: user.id,
            status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
          },
        },
        deletedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        level: true,
        language: true,
        ratingAverage: true,
        originalPrice: true,
        discountPrice: true,
        status: true,
        createdAt: true,
        LessonProgress: {
          where: {
            userId: user.id,
          },
          select: {
            completed: true,
            progressValue: true,
            lastViewedAt: true,
            completedAt: true,
          },
        },
        createdBy: {
          select: {
            displayName: true,
            user: { select: { avatarUrl: true } },
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        courseInstructors: {
          select: {
            role: true,
            instructor: {
              select: {
                displayName: true,
                user: { select: { avatarUrl: true } },
              },
            },
          },
        },
        _count: {
          select: {
            enrollments: true,
            reviews: true,
            LessonProgress: {
              where: {
                userId: user.id,
              },
            },
            courseInstructors: true,
          },
        },
        modules: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
          select: {
            lessons: {
              where: { deletedAt: null },
              orderBy: { position: 'asc' },
              select: {
                duration: true,
              },
            },
            _count: {
              select: {
                lessons: {
                  where: { deletedAt: null },
                },
              },
            },
          },
        },
      },
    });
  }, 'Get enrolled courses for student');

  return courses.map(course => ({
    id: course.id,
    title: course.title,
    thumbnailUrl: course.thumbnailUrl,
    level: course.level,
    language: course.language,
    ratingAverage: Number(course.ratingAverage ?? 0),
    originalPrice: Number(course.originalPrice),
    discountPrice: course.discountPrice === null ? null : Number(course.discountPrice),
    status: course.status,
    createdAt: course.createdAt,
    createdBy: {
      displayName: course.createdBy?.displayName ?? 'AloSkill Instructor',
      avatarUrl: course.createdBy?.user.avatarUrl ?? null,
    },
    category: course.category,
    courseInstructors: course.courseInstructors.map(item => ({
      role: item.role,
      displayName: item.instructor.displayName,
      avatarUrl: item.instructor.user.avatarUrl,
    })),
    modules: course.modules,
    _count: course._count,
    lessonProgress: course.LessonProgress,
    enrollments: [{ userId: user.id }],
  }));
};

const getAllCoursesForPublic = async (req: Request) => {
  const { isHome } = req.query;
  const getCourses = await executeDbOperation(async prisma => {
    return await prisma.course.findMany({
      where: {
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
        ...(isHome && { ratingAverage: { gte: 2 } }),
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        originalPrice: true,
        discountPrice: true,
        status: true,
        language: true,
        ratingAverage: true,
        level: true,
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
          select: {
            userId: true,
          },
        },
      },
    });
  }, 'Get All Associated Courses for Public view');

  if (getCourses.length === 0) {
    throw new Error('No Courses Found');
  }
  return getCourses;
};

const getAllCoursesForAdminDashboardStudentView = async (req: Request) => {
  const user = req.user;
  if (!user.email) {
    throw new Error('User email not found in request');
  }

  const userProfile = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: { email: user.email, deletedAt: null, status: UserStatus.ACTIVE },
      include: { assignedRole: true },
    });
  });
  if (!userProfile) {
    throw new Error('Unauthorized: User profile not found.');
  }
  const isAuthorized = userProfile.assignedRole.some(r => r.role === 'ADMIN');
  if (!isAuthorized) {
    throw new Error('Security Violation: Only Admins can see this status');
  }

  const courses = await executeDbOperation(async prisma => {
    return await prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        title: true,
        discountPrice: true,
        originalPrice: true,
        category: {
          select: {
            name: true,
          },
        },
        createdBy: {
          select: {
            displayName: true,
          },
        },
      },
    });
  });

  if (courses.length === 0) {
    throw new Error('No courses found');
  }
  return courses;
};

const getSingleCourseForPublicView = async (req: Request) => {
  const courseId = typeof req.params.courseId === 'string' ? req.params.courseId : undefined;

  if (!courseId) {
    throw new Error('Invalid Course ID');
  }

  const getCourseDetails = await executeDbOperation(async prisma => {
    return await prisma.course.findUnique({
      where: { id: courseId, deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        trailerUrl: true,
        createdAt: true,
        updatedAt: true,
        level: true,
        language: true,
        originalPrice: true,
        discountPrice: true,
        discountPercent: true,
        isDiscountActive: true,
        discountEndDate: true,
        ratingAverage: true,
        ratingCount: true,
        enrollmentCount: true,
        moduleCount: true,

        courseInstructors: {
          select: {
            instructorId: true,
            instructor: {
              select: {
                userId: true,
                ratingAverage: true,
                displayName: true,
                bio: true,
                expertise: true,
                ownedCourses: {
                  select: {
                    enrollmentCount: true,
                  },
                },
                user: {
                  select: {
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },

        reviews: {
          select: {
            rating: true,
            body: true,
            createdAt: true,
            user: {
              select: {
                studentProfile: { select: { displayName: true } },
                avatarUrl: true,
              },
            },
          },
        },

        modules: {
          select: {
            title: true,
            position: true,
            lessons: {
              select: {
                position: true,
                contentUrl: true,
                title: true,
                type: true,
                duration: true,
                files: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },

        category: {
          select: {
            name: true,
          },
        },
      },
    });
  }, 'Get Specific Course Data');

  if (!getCourseDetails) {
    throw new Error('Course Not Found');
  }

  const formatCourseData = (course: typeof getCourseDetails) => {
    let totalDuration = 0;
    let totalFiles = 0;
    let totalArticles = 0;

    course.modules.forEach(module => {
      module.lessons.forEach(lesson => {
        if (lesson.type === 'ARTICLE') {
          totalArticles++;
        }
        totalFiles += lesson.files.length;
        totalDuration += lesson.duration ?? 0;
      });
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    course.reviews.forEach(r => {
      distribution[r.rating]++;
    });

    const totalReviews = course.reviews.length;
    const ratingStats = Object.keys(distribution).map(star => {
      const starNum = Number(star);
      return {
        star: starNum,
        count: distribution[starNum],
        percentage: `${((distribution[starNum] / totalReviews) * 100).toFixed(0)}%`,
      };
    });
    const hours = Math.floor(totalDuration / 3600);
    const minutes = Math.floor((totalDuration % 3600) / 60);
    const totalDurationInFormatted = `${hours}:${minutes.toString().padStart(2, '0')} mins`;
    console.log('total sec :::', totalDuration);
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      trailerUrl: course.trailerUrl,
      originalPrice: course.originalPrice,
      discountPrice: course.discountPrice,
      discountPercent: course.discountPercent,
      discountEndDate: course.discountEndDate,
      isDiscountActive: course.isDiscountActive,
      language: course.language,
      level: course.level,
      ratingAverage: course.ratingAverage,
      ratingCount: course.ratingCount,
      enrollmentCount: course.enrollmentCount,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      category: course.category?.name,
      courseInstructors: course.courseInstructors.map(i => ({
        instructorId: i.instructorId,
        userId: i.instructor.userId,
        bio:
          i.instructor.bio.length >= 150
            ? `${i.instructor.bio.substring(0, 150)}...`
            : i.instructor.bio,
        rating: i.instructor.ratingAverage,
        expertise: i.instructor.expertise,
        totalStudents: i.instructor.ownedCourses.reduce((a, b) => b.enrollmentCount + a, 0),
        totalCourses: i.instructor.ownedCourses.length,
        displayName: i.instructor.displayName,
        avatarUrl: i.instructor.user.avatarUrl,
      })),
      reviews: course.reviews.map(review => ({
        rating: review.rating,
        body: review.body,
        createdAt: review.createdAt,
        userDisplayName: review.user.studentProfile?.displayName,
        avatarUrl: review.user.avatarUrl,
      })),
      content: {
        totalModules: course.moduleCount,
        totalLessons: course.modules.reduce((a, b) => b.lessons.length + a, 0),
        totalDuration: totalDurationInFormatted,
        totalArticles,
        totalFiles,
      },
      modules: course.modules.map(m => {
        const totalSeconds = m.lessons.reduce((a, b) => (b.duration ?? 0) + a, 0);
        const totalDurationForModule = `${Math.floor(totalSeconds / 3600)}:${Math.floor(
          (totalSeconds % 3600) / 60
        )
          .toString()
          .padStart(2, '0')}`;
        return {
          title: m.title,
          duration: totalDurationForModule,
          lessons: m.lessons.map(l => {
            const totalLessonDuration = l.duration ?? 0;
            const totalDurationForLesson = `${Math.floor(totalLessonDuration / 3600)}:${Math.floor(
              (totalLessonDuration % 3600) / 60
            )
              .toString()
              .padStart(2, '0')}`;
            return {
              title: l.title,
              duration: totalDurationForLesson,
              type: l.type,
              contentUrl: m.position === 1 && l.position < 3 ? l.contentUrl : null,
            };
          }),
        };
      }),
      ratingBreakdown: ratingStats,
    };
  };
  return formatCourseData(getCourseDetails);
};

const getSingleCourseForPaidView = async (req: Request) => {
  const { courseId, userId } = req.params;

  if (!courseId || !userId) {
    throw new Error('Required data not found for this request');
  }
  if (typeof courseId !== 'string') {
    throw new Error('A valid Course ID must be provided');
  }
  if (typeof userId !== 'string') {
    throw new Error('A valid User ID must be provided');
  }
  const getCourseDetails = await executeDbOperation(async prisma => {
    return await prisma.course.findFirst({
      where: {
        id: courseId,
        enrollments: {
          some: {
            userId,
            status: EnrollmentStatus.ACTIVE,
          },
        },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,

        modules: {
          orderBy: { position: 'asc' },
          select: {
            title: true,
            position: true,
            lessons: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                position: true,
                contentUrl: true,
                title: true,
                description: true,
                notes: true,
                type: true,
                duration: true,
                files: {
                  select: {
                    name: true,
                    url: true,
                  },
                },
                progressRecords: {
                  where: {
                    userId,
                  },
                  select: {
                    completed: true,
                    progressValue: true,
                    lastPosition: true,
                    lastViewedAt: true,
                    completedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }, 'Get Specific Course Data for paid view');

  if (!getCourseDetails) {
    throw new Error('Course not found or you are not enrolled.');
  }

  const totalDurationSeconds = getCourseDetails.modules.reduce((acc, mod) => {
    return acc + mod.lessons.reduce((lAcc, lesson) => lAcc + (lesson.duration ?? 0), 0);
  }, 0);

  const hours = Math.floor(totalDurationSeconds / 3600);
  const minutes = Math.floor((totalDurationSeconds % 3600) / 60);
  const formattedDuration = `${hours}h ${minutes.toString().padStart(2, '0')}m`;

  return {
    id: getCourseDetails.id,
    title: getCourseDetails.title,
    createdAt: getCourseDetails.createdAt,
    updatedAt: getCourseDetails.updatedAt,
    content: {
      totalLessons: getCourseDetails.modules.reduce((acc, m) => acc + m.lessons.length, 0),
      totalDuration: formattedDuration,
    },
    modules: getCourseDetails.modules.map(m => {
      const totalSeconds = m.lessons.reduce((acc, l) => acc + (l.duration ?? 0), 0);
      const totalDurationForModule = `${Math.floor(totalSeconds / 3600)}:${Math.floor(
        (totalSeconds % 3600) / 60
      )
        .toString()
        .padStart(2, '0')}`;
      return {
        isExpanded: false,
        position: m.position,
        title: m.title,
        moduleDuration: totalDurationForModule,
        lessons: m.lessons.map(l => {
          const totalLessonDuration = l.duration ?? 0;
          const totalDurationForLesson = `${Math.floor(totalLessonDuration / 3600)}:${Math.floor(
            (totalLessonDuration % 3600) / 60
          )
            .toString()
            .padStart(2, '0')}`;
          return {
            id: l.id,
            position: l.position,
            title: l.title,
            description: l.description,
            notes: l.notes,
            duration: totalDurationForLesson,
            type: l.type,
            contentUrl: l.contentUrl,
            files: l.files,
            lessonProgress: l.progressRecords,
          };
        }),
      };
    }),
  };
};

const getSingleCourseForInstructorView = async (req: Request) => {
  const { courseId } = req.params;

  if (typeof courseId !== 'string') {
    throw new Error('Valid Course ID must be provided as a string');
  }

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const getCourseDetails = await executeDbOperation(async prisma => {
    return await prisma.course.findUnique({
      where: { id: courseId, deletedAt: null },
      select: {
        title: true,
        createdAt: true,
        updatedAt: true,
        description: true,
        level: true,
        language: true,
        views: true,
        thumbnailUrl: true,
        originalPrice: true,
        discountPrice: true,
        isDiscountActive: true,
        currency: true,
        ratingAverage: true,
        ratingCount: true,
        enrollmentCount: true,

        createdBy: {
          select: {
            displayName: true,
            user: { select: { avatarUrl: true } },
          },
        },
        courseInstructors: {
          select: {
            role: true,
            instructor: {
              select: {
                displayName: true,
                user: { select: { avatarUrl: true } },
              },
            },
          },
        },

        reviews: {
          select: {
            rating: true,
            body: true,
            createdAt: true,
            user: {
              select: {
                studentProfile: { select: { displayName: true } },
                avatarUrl: true,
              },
            },
          },
        },

        modules: {
          select: {
            lessons: {
              select: {
                type: true,
                duration: true,
                files: true,
                quiz: {
                  select: {
                    duration: true,
                  },
                },
              },
            },
          },
        },

        category: {
          select: {
            name: true,
          },
        },
        tags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            wishlistedBy: true,
            enrollments: {
              where: {
                startedAt: {
                  gte: oneWeekAgo,
                },
              },
            },
          },
        },
      },
    });
  }, 'Get Specific Course Data');

  if (!getCourseDetails) {
    throw new Error('Course Not Found');
  }

  const formatCourseData = (course: typeof getCourseDetails) => {
    let totalVideoCount = 0;
    let totalDuration = 0;
    let totalFiles = 0;

    course.modules.forEach(module => {
      module.lessons.forEach(lesson => {
        if (lesson.type === 'VIDEO') {
          totalVideoCount++;
          totalDuration += lesson.duration ?? 0;
        }
        if (lesson.type === 'ARTICLE') {
          totalDuration += lesson.duration ?? 0;
        }
        if (lesson.type === 'QUIZ') {
          totalDuration += lesson.duration ?? 0;
        }
        totalFiles += lesson.files.length;
      });
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    course.reviews.forEach(r => {
      distribution[r.rating]++;
    });

    const totalReviews = course.reviews.length;
    const ratingStats = Object.keys(distribution).map(star => {
      const starNum = Number(star);
      return {
        star: starNum,
        count: distribution[starNum],
        percentage: `${((distribution[starNum] / totalReviews) * 100).toFixed(0)}%`,
      };
    });
    const hours = Math.floor(totalDuration / 3600);
    const minutes = Math.floor((totalDuration % 3600) / 60);
    const totalDurationInFormatted = `${hours}:${minutes.toString().padStart(2, '0')} mins`;

    return {
      title: course.title,
      originalPrice: course.originalPrice,
      discountPrice: course.discountPrice,
      objective: course.description ? JSON.parse(course.description).objectives : [],
      isDiscountActive: course.isDiscountActive,
      currency: course.currency,
      enrollmentCount: course.enrollmentCount,
      enrolledLastWeek: course._count.enrollments,
      language: course.language,
      thumbnailUrl: course.thumbnailUrl,
      level: course.level,
      ratingAverage: course.ratingAverage,
      ratingCount: course.ratingCount,
      views: course.views,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      tags: course.tags.map(t => t.tag.name),
      category: course.category?.name,
      totalWishListed: course._count.wishlistedBy,
      createdBy: {
        displayName: course.createdBy?.displayName,
        avatarUrl: course.createdBy?.user.avatarUrl,
      },
      courseInstructors: course.courseInstructors.map(i => ({
        role: i.role,
        displayName: i.instructor.displayName,
        avatarUrl: i.instructor.user.avatarUrl,
      })),
      reviews: course.reviews.map(review => ({
        rating: review.rating,
        body: review.body,
        createdAt: review.createdAt,
        userDisplayName: review.user.studentProfile?.displayName,
        avatarUrl: review.user.avatarUrl,
      })),
      content: {
        totalVideos: totalVideoCount,
        totalDuration: totalDurationInFormatted,
        totalFiles,
      },
      ratingBreakdown: ratingStats,
    };
  };
  return formatCourseData(getCourseDetails);
};

const getSingleCourseForInstructorEdit = async (req: Request) => {
  const { courseId } = req.params;

  if (typeof courseId !== 'string') {
    throw new Error('Valid Course ID must be provided as a string');
  }

  const getCourseDetails = await executeDbOperation(async prisma => {
    return await prisma.course.findUnique({
      where: { id: courseId, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        welcomeMessage: true,
        congratulationsMessage: true,
        originalPrice: true,
        discountPrice: true,
        discountEndDate: true,
        language: true,
        level: true,
        thumbnailUrl: true,
        trailerUrl: true,
        status: true,
        category: {
          select: {
            name: true,
          },
        },
        tags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
        courseInstructors: {
          select: {
            instructor: {
              select: {
                displayName: true,
              },
            },
            role: true,
            instructorId: true,
          },
        },
        modules: {
          select: {
            title: true,
            position: true,
            lessons: {
              select: {
                title: true,
                position: true,
                type: true,
                notes: true,
                description: true,
                contentUrl: true,
                contentName: true,
                duration: true,
                files: {
                  select: {
                    url: true,
                    name: true,
                  },
                },
                quiz: {
                  select: {
                    title: true,
                    description: true,
                    passingScore: true,
                    duration: true,
                    attemptsAllowed: true,
                    questions: {
                      select: {
                        text: true,
                        type: true,
                        position: true,
                        points: true,
                        options: {
                          select: {
                            position: true,
                            text: true,
                            isCorrect: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }, 'Get Specific Course Data for Edit');

  if (!getCourseDetails) {
    throw new Error('Course Not Found');
  }

  const formatCourseData = (course: typeof getCourseDetails) => {
    return {
      ...course,
      welcomeMessage: course.welcomeMessage ?? undefined,
      congratulationsMessage: course.welcomeMessage ?? undefined,
      category: '',
      subCategory: course.category?.name,
      tags: course.tags.map(t => t.tag.name),
      courseInstructors: course.courseInstructors.map(ci => ({
        instructorId: ci.instructorId,
        displayName: ci.instructor.displayName,
        role: ci.role,
      })),
      modules: course.modules.map(m => ({
        title: m.title,
        position: m.position,
        lessons: m.lessons.map(l => ({
          title: l.title,
          position: l.position,
          notes: l.notes ?? undefined,
          description: l.description ?? '',
          type: l.type,
          contentUrl: {
            name: l.contentName ?? '',
            url: l.contentUrl ?? '',
          },
          files: l.files.map(f => ({
            url: f.url,
            name: f.name,
          })),
          duration: l.duration,
          quiz: l.quiz
            ? {
                title: l.quiz.title,
                description: l.quiz.description,
                duration: l.quiz.duration,
                passingScore: l.quiz.passingScore,
                attemptsAllowed: l.quiz.attemptsAllowed,
                questions: l.quiz.questions.map(q => ({
                  position: q.position,
                  text: q.text,
                  type: q.type,
                  points: q.points,
                  options: q.options.map(o => ({
                    position: o.position,
                    text: o.text,
                    isCorrect: o.isCorrect,
                  })),
                })),
              }
            : undefined,
        })),
      })),
    };
  };
  return formatCourseData(getCourseDetails);
};

const getInstructorEarnings = async (req: Request) => {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) {
    throw new Error('Unauthorized: Instructor user not found');
  }

  return await executeDbOperation(async prisma => {
    const instructor = await prisma.instructorProfile.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: ApplicationStatus.APPROVED,
      },
      select: {
        id: true,
        userId: true,
        displayName: true,
        authorProfile: { select: { id: true } },
      },
    });

    if (!instructor) {
      throw new Error('Approved instructor profile not found');
    }

    const instructorContentFilter = {
      OR: [
        { course: { is: { createdById: instructor.id, deletedAt: null } } },
        {
          book: {
            is: {
              deletedAt: null,
              OR: [
                { ownerId: instructor.userId },
                ...(instructor.authorProfile?.id
                  ? [{ authorProfileId: instructor.authorProfile.id }]
                  : []),
              ],
            },
          },
        },
      ],
    };

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [paidItems, payouts, payoutMethods] = await Promise.all([
      prisma.orderItem.findMany({
        where: {
          ...instructorContentFilter,
          order: { status: OrderStatus.PAID },
        },
        select: {
          id: true,
          price: true,
          quantity: true,
          createdAt: true,
          course: { select: { id: true, title: true } },
          book: { select: { id: true, title: true, coverImage: true } },
          order: {
            select: {
              id: true,
              currency: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payout.findMany({
        where: { instructorId: userId, deletedAt: null },
        select: {
          id: true,
          amount: true,
          fee: true,
          currency: true,
          payoutDate: true,
          status: true,
          failureReason: true,
          rejectionReason: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.payoutMethod.findMany({
        where: { instructorId: userId },
        select: {
          id: true,
          type: true,
          bankName: true,
          mobileBankingName: true,
          accHolderName: true,
          accountNumber: true,
          branchName: true,
          routingNumber: true,
          isDefault: true,
          createdAt: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const amountForItem = (item: { price: unknown; quantity: number }) =>
      Number(item.price) * item.quantity;

    const totalRevenue = paidItems.reduce((sum, item) => sum + amountForItem(item), 0);
    const todayRevenue = paidItems
      .filter(item => item.order.createdAt >= todayStart)
      .reduce((sum, item) => sum + amountForItem(item), 0);

    const totalWithdrawn = payouts
      .filter(payout => payout.status === PaymentStatus.PAID)
      .reduce((sum, payout) => sum + Number(payout.amount), 0);
    const pendingPayout = payouts
      .filter(payout => payout.status === PaymentStatus.PENDING)
      .reduce((sum, payout) => sum + Number(payout.amount), 0);
    const availableBalance = Math.max(0, totalRevenue - totalWithdrawn - pendingPayout);

    const monthKeys: { key: string; label: string }[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setMonth(date.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push({
        key,
        label: date.toLocaleString('en-US', { month: 'short' }),
      });
    }

    const monthlyTotals = new Map(monthKeys.map(month => [month.key, 0]));
    for (const item of paidItems) {
      if (item.order.createdAt < sixMonthsAgo) {
        continue;
      }
      const date = item.order.createdAt;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyTotals.has(key)) {
        monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + amountForItem(item));
      }
    }

    const productMap = new Map<
      string,
      { id: string; title: string; type: 'COURSE' | 'BOOK'; sales: number; revenue: number }
    >();
    for (const item of paidItems) {
      const product = item.course
        ? { id: item.course.id, title: item.course.title, type: 'COURSE' as const }
        : item.book
          ? { id: item.book.id, title: item.book.title, type: 'BOOK' as const }
          : null;
      if (!product) {
        continue;
      }
      const key = `${product.type}:${product.id}`;
      const current = productMap.get(key) ?? { ...product, sales: 0, revenue: 0 };
      current.sales += item.quantity;
      current.revenue += amountForItem(item);
      productMap.set(key, current);
    }

    const maskAccountNumber = (value: string) => {
      const clean = value.trim();
      if (clean.length <= 4) {
        return clean;
      }
      return `${'*'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
    };

    return {
      currency: paidItems[0]?.order.currency ?? payouts[0]?.currency ?? 'BDT',
      instructorName: instructor.displayName,
      summary: {
        totalRevenue,
        availableBalance,
        totalWithdrawn,
        pendingPayout,
        todayRevenue,
        totalSales: paidItems.reduce((sum, item) => sum + item.quantity, 0),
      },
      monthlyRevenue: monthKeys.map(month => ({
        month: month.label,
        amount: monthlyTotals.get(month.key) ?? 0,
      })),
      topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      recentSales: paidItems.slice(0, 10).map(item => ({
        id: item.id,
        orderId: item.order.id,
        productId: item.course?.id ?? item.book?.id ?? '',
        productTitle: item.course?.title ?? item.book?.title ?? 'Unknown item',
        type: item.course ? ('COURSE' as const) : ('BOOK' as const),
        amount: amountForItem(item),
        quantity: item.quantity,
        createdAt: item.order.createdAt,
      })),
      payouts: payouts.map(payout => ({
        ...payout,
        amount: Number(payout.amount),
        fee: payout.fee ? Number(payout.fee) : 0,
      })),
      payoutMethods: payoutMethods.map(method => ({
        ...method,
        accountNumber: maskAccountNumber(method.accountNumber),
      })),
    };
  }, 'Get Instructor Earnings');
};

const getInstructorDashboardData = async (req: Request) => {
  const authenticatedUserId = (req as any).user?.id as string | undefined;
  const requestedUserId = req.query.userId as string | undefined;
  const userId = authenticatedUserId ?? requestedUserId;

  if (!userId) {
    throw new Error('User not Found for Dashboard Data');
  }

  const instructorData = await executeDbOperation(async prisma => {
    const primaryInstructor = await prisma.instructorProfile.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: ApplicationStatus.APPROVED,
      },
      select: {
        id: true,
        userId: true,
        displayName: true,
        ratingAverage: true,
        user: { select: { avatarUrl: true } },
        authorProfile: { select: { id: true } },
      },
    });

    if (!primaryInstructor) {
      throw new Error('Approved instructor profile not found');
    }

    const ownedCourses = await prisma.course.findMany({
      where: { createdById: primaryInstructor.id, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        enrollmentCount: true,
        ratingAverage: true,
        ratingCount: true,
        views: true,
        thumbnailUrl: true,
        totalRevenueAmount: true,
        createdAt: true,
      },
      orderBy: [{ enrollmentCount: 'desc' }, { createdAt: 'desc' }],
    });

    const ownedCourseIds = ownedCourses.map(course => course.id);

    const instructorContentFilter = {
      OR: [
        { course: { is: { createdById: primaryInstructor.id, deletedAt: null } } },
        {
          book: {
            is: {
              deletedAt: null,
              OR: [
                { ownerId: primaryInstructor.userId },
                ...(primaryInstructor.authorProfile?.id
                  ? [{ authorProfileId: primaryInstructor.authorProfile.id }]
                  : []),
              ],
            },
          },
        },
      ],
    };

    const [
      activeEnrollments,
      uniqueStudents,
      latestEnrollments,
      reviews,
      latestReviews,
      paidItems,
    ] = await Promise.all([
      prisma.enrollment.count({
        where: {
          courseId: { in: ownedCourseIds },
          status: EnrollmentStatus.ACTIVE,
          deletedAt: null,
        },
      }),
      prisma.enrollment.findMany({
        where: {
          courseId: { in: ownedCourseIds },
          status: EnrollmentStatus.ACTIVE,
          deletedAt: null,
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      prisma.enrollment.findMany({
        where: {
          courseId: { in: ownedCourseIds },
          deletedAt: null,
        },
        select: {
          id: true,
          startedAt: true,
          course: { select: { id: true, title: true } },
          user: {
            select: {
              avatarUrl: true,
              studentProfile: { select: { displayName: true } },
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        take: 8,
      }),
      prisma.review.findMany({
        where: {
          courseId: { in: ownedCourseIds },
          deletedAt: null,
        },
        select: { rating: true },
      }),
      prisma.review.findMany({
        where: {
          courseId: { in: ownedCourseIds },
          deletedAt: null,
        },
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
          course: { select: { id: true, title: true } },
          user: {
            select: {
              avatarUrl: true,
              studentProfile: { select: { displayName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.orderItem.findMany({
        where: {
          ...instructorContentFilter,
          order: { status: OrderStatus.PAID },
        },
        select: {
          id: true,
          price: true,
          quantity: true,
          createdAt: true,
          course: { select: { id: true, title: true } },
          book: { select: { id: true, title: true } },
          order: {
            select: {
              currency: true,
              createdAt: true,
              user: {
                select: {
                  avatarUrl: true,
                  studentProfile: { select: { displayName: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const amountForItem = (item: { price: unknown; quantity: number }) =>
      Number(item.price) * item.quantity;

    const totalRevenue = paidItems.reduce((sum, item) => sum + amountForItem(item), 0);
    const totalViews = ownedCourses.reduce((sum, course) => sum + course.views, 0);

    const ratingCount = reviews.length;
    const ratingTotal = reviews.reduce((sum, review) => sum + review.rating, 0);
    const overallRating = ratingCount > 0 ? Number((ratingTotal / ratingCount).toFixed(1)) : 0;

    const ratingDistribution = [5, 4, 3, 2, 1].map(star => {
      const count = reviews.filter(review => review.rating === star).length;
      return {
        star,
        count,
        percentage: ratingCount > 0 ? Math.round((count / ratingCount) * 100) : 0,
      };
    });

    const courseRevenue = new Map<string, number>();
    for (const item of paidItems) {
      if (!item.course?.id) {
        continue;
      }
      courseRevenue.set(
        item.course.id,
        (courseRevenue.get(item.course.id) ?? 0) + amountForItem(item)
      );
    }

    const enrollmentActivities = latestEnrollments.map(enrollment => ({
      id: `enrollment-${enrollment.id}`,
      type: 'ENROLLMENT' as const,
      title: `${enrollment.user.studentProfile?.displayName ?? 'A student'} enrolled`,
      detail: enrollment.course.title,
      timestamp: enrollment.startedAt,
      avatarUrl: enrollment.user.avatarUrl,
    }));

    const reviewActivities = latestReviews.map(review => ({
      id: `review-${review.id}`,
      type: 'REVIEW' as const,
      title: `${review.user.studentProfile?.displayName ?? 'A student'} left a ${review.rating}-star review`,
      detail: review.course?.title ?? 'Course review',
      timestamp: review.createdAt,
      avatarUrl: review.user.avatarUrl,
    }));

    const purchaseActivities = paidItems.slice(0, 8).map(item => ({
      id: `purchase-${item.id}`,
      type: 'PURCHASE' as const,
      title: `${item.order.user.studentProfile?.displayName ?? 'A customer'} made a purchase`,
      detail: item.course?.title ?? item.book?.title ?? 'AloSkill content',
      timestamp: item.order.createdAt,
      avatarUrl: item.order.user.avatarUrl,
    }));

    const recentActivity = [...enrollmentActivities, ...reviewActivities, ...purchaseActivities]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    return {
      profile: {
        name: primaryInstructor.displayName,
        avatarUrl: primaryInstructor.user.avatarUrl,
        overallRating,
        ratingCount,
      },
      counters: {
        totalCourses: ownedCourses.length,
        totalStudents: uniqueStudents.length,
        totalEnrolled: activeEnrollments,
        totalRevenue,
        totalViews,
      },
      recentActivity,
      reviews: latestReviews.map(review => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        createdAt: review.createdAt,
        courseId: review.course?.id,
        courseTitle: review.course?.title,
        userDisplayName: review.user.studentProfile?.displayName ?? 'Student',
        avatarUrl: review.user.avatarUrl,
      })),
      ratingDistribution,
      courseOverview: ownedCourses.slice(0, 6).map(course => ({
        id: course.id,
        title: course.title,
        status: course.status,
        enrollmentCount: course.enrollmentCount,
        ratingAverage: Number(course.ratingAverage ?? 0),
        ratingCount: course.ratingCount,
        views: course.views,
        thumbnailUrl: course.thumbnailUrl,
        revenue: courseRevenue.get(course.id) ?? Number(course.totalRevenueAmount ?? 0),
      })),
    };
  }, 'Fetch Instructor Dashboard Data');

  return instructorData;
};

const updateLessonProgress = async (req: Request) => {
  const userId = req.params.userId as string;
  const { courseId, lessonId, progressValue, lastPosition, isFinished } = req.body as {
    courseId: string;
    lessonId: string;
    progressValue: number;
    lastPosition: number;
    isFinished: boolean;
  };

  if (!userId) {
    throw new Error('User not found');
  }
  if (!courseId) {
    throw new Error('Course Id not found');
  }
  if (!lessonId) {
    throw new Error('Lesson Id not found');
  }

  const updateData = await executeDbOperation(async prisma => {
    return await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: { userId, lessonId },
      },
      update: {
        progressValue,
        lastViewedAt: new Date(),
        completed: isFinished,
        completedAt: isFinished ? new Date() : undefined,
      },
      create: {
        userId,
        lessonId,
        courseId,
        progressValue,
        lastPosition,
        completed: isFinished,
        completedAt: isFinished ? new Date() : null,
        lastViewedAt: new Date(),
      },
    });
  });

  if (!updateData.id) {
    throw new Error('Failed to update lesson for lessonProgress');
  }
  return lessonId;
};

const getBunnySignature = async (req: Request) => {
  const { collectionName, fileName } = req.query as { collectionName: string; fileName: string };
  const apiKey = config.BUNNY_STREAM_API_KEY;
  const videoLibraryId = config.BUNNY_STREAM_LIBRARY_ID;
  const expires = Math.floor(Date.now() / 1000) + 900;

  const createVideoBuffer = async (collectionId: string) => {
    const createResponse = await fetch(
      `https://video.bunnycdn.com/library/${videoLibraryId}/videos`,
      {
        method: 'POST',
        body: JSON.stringify({ title: fileName, collectionId }),
        headers: { AccessKey: apiKey, 'Content-Type': 'application/json' },
      }
    );
    if (!createResponse.ok) {
      const errorData = (await createResponse.json()) as { message?: string };
      throw new Error(`Bunny API Error: ${errorData.message ?? createResponse.statusText}`);
    }
    const createData = (await createResponse.json()) as { guid: string };

    const signature = crypto
      .createHash('sha256')
      .update(`${Number(videoLibraryId)}${apiKey}${expires}${createData.guid}`)
      .digest('hex');

    return {
      videoId: createData.guid,
      token: signature,
      expires,
      libraryId: videoLibraryId,
      collectionId,
    };
  };

  const checkCollectionAvailable = await fetch(
    `https://video.bunnycdn.com/library/${videoLibraryId}/collections`,
    { headers: { AccessKey: apiKey } }
  );
  if (!checkCollectionAvailable.ok) {
    const errorData = (await checkCollectionAvailable.json()) as { message?: string };
    throw new Error(`Bunny API Error: ${errorData.message ?? checkCollectionAvailable.statusText}`);
  }
  const listData = (await checkCollectionAvailable.json()) as {
    items: { name: string; guid: string }[];
  };
  const existing = listData.items.find(c => c.name === collectionName);
  if (existing) {
    return await createVideoBuffer(existing.guid);
  }
  const createCollectionResponse = await fetch(
    `https://video.bunnycdn.com/library/${videoLibraryId}/collections`,
    {
      method: 'POST',
      headers: {
        AccessKey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: collectionName }),
    }
  );

  if (!createCollectionResponse.ok) {
    const errorData = (await createCollectionResponse.json()) as { message?: string };
    throw new Error(`Bunny API Error: ${errorData.message ?? createCollectionResponse.statusText}`);
  }

  const data = (await createCollectionResponse.json()) as { guid: string };
  return await createVideoBuffer(data.guid);
};

const createFileToBunny = async (req: Request) => {
  const { folder } = req.query as { folder: string };
  if (!folder) {
    return null;
  }
  const REGION = 'sg';
  const BASE_HOSTNAME = 'storage.bunnycdn.com';
  const HOSTNAME = `${REGION}.${BASE_HOSTNAME}`;

  const uniqueId = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now();
  const fileName = `${timestamp}-${uniqueId}-${req.file?.originalname}`;
  const storageZone = config.BUNNY_STORAGE_ZONE_USERNAME;
  const accessKey = config.BUNNY_STORAGE_ZONE_PASSWORD;
  const safePath = encodeURI(folder.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/'));

  const uploadfile = await fetch(`https://${HOSTNAME}/${storageZone}/${safePath}/${fileName}`, {
    method: 'PUT',
    headers: {
      AccessKey: accessKey,
      'Content-Type': 'application/octet-stream',
    },
    body: req.file?.buffer,
  });
  if (!uploadfile.ok) {
    const errorText = await uploadfile.text();
    throw new Error(`Bunny Storage API Error: ${errorText}`);
  }
  // return `https://sg.storage.bunnycdn.com/${storageZone}/${safePath}/${fileName}`;
  // return `https://aloskill-pull-zone-7.b-cdn.net/${safePath}/${fileName}`;
  const pullZoneUrl = `https://${config.BUNNY_PULL_ZONE.replace(/\/+$/, '')}`;

  return `${pullZoneUrl}/${safePath}/${fileName}`;
};

// currently not used in anyother api
const getVideo = async (req: Request) => {
  const { videoUrl } = req.body as { videoUrl: string };
  if (!videoUrl) {
    throw new Error('Video Url Not Provided');
  }
  const getVideoResponse = await fetch(videoUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      AccessKey: config.BUNNY_STREAM_API_KEY,
    },
  });

  if (getVideoResponse.ok) {
    return true;
  }
  return false;
};

const getSecureVideoToken = (req: Request) => {
  const { filePath, duration } = req.body as { filePath: string; duration: number };
  if (!filePath) {
    throw new Error('File Path Not Provided');
  }

  // const path = `/play/${filePath}`;
  // const userIp = req.ip;
  const authenticationKey = config.BUNNY_STREAM_TOKEN_AUTH_KEY;
  const libraryId = config.BUNNY_STREAM_LIBRARY_ID;
  const expires = Math.floor(new Date().getTime() / 1000) + duration * 60;
  const hashableBase = authenticationKey + filePath + expires;

  const signature = crypto.createHash('sha256').update(hashableBase).digest('hex');

  return {
    libraryId,
    token: signature,
    videoId: filePath,
    expiresAt: expires,
  };
};

const deleteVideo = async (req: Request) => {
  const { videoUrl } = req.body as { videoUrl: string };
  if (!videoUrl) {
    throw new Error('Video Url Not Provided');
  }
  const deleteVideoResponse = await fetch(videoUrl, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      AccessKey: config.BUNNY_STREAM_API_KEY,
    },
  });

  if (deleteVideoResponse.ok) {
    return true;
  }
  return false;
};

const deleteFile = async (req: Request) => {
  const storageZone = config.BUNNY_STORAGE_ZONE_USERNAME;
  const { fileUrl } = req.body as { fileUrl: string };
  if (!fileUrl) {
    throw new Error('File path not provided');
  }
  const fileArray = fileUrl.split('/');
  fileArray.splice(0, 3);
  const response = await fetch(
    `https://sg.storage.bunnycdn.com/${storageZone}/${fileArray.join('/')}`,
    {
      method: 'DELETE',
      headers: {
        AccessKey: config.BUNNY_STORAGE_ZONE_PASSWORD,
        accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    return false;
  }

  return true;
};

export const courseService = {
  isCourseSlugAvailable,
  createCourse,
  updateCourse,
  getAllCoursesForInstructor,
  getAllCoursesForStudent,
  getAllCoursesForPublic,
  getAllCoursesForAdminDashboardStudentView,
  getCategories,
  getCourseInstructors,
  getInstructorDashboardData,
  getInstructorEarnings,
  getCourseTags,
  getBunnySignature,
  createFileToBunny,
  getSingleCourseForInstructorView,
  getSingleCourseForPublicView,
  getSingleCourseForPaidView,
  getSingleCourseForInstructorEdit,
  updateLessonProgress,
  deleteVideo,
  getVideo,
  deleteFile,
  getSecureVideoToken,
};
