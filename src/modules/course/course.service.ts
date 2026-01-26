/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import crypto from 'crypto';
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { config } from '../../config/env.js';
import {
  ApplicationStatus,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  Language,
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

const getAllCoursesForPublic = async (req: Request) => {
  const { take, page, isHome, category, level, language, rating, priceMin, priceMax } = req.query;
  const getCourses = await executeDbOperation(async prisma => {
    return await prisma.course.findMany({
      where: {
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
        ...(category && { category: { name: category as string } }),
        ...(language && {
          language: language === 'bangla' ? Language.BANGLA : Language.ENGLISH,
        }),
        ...(level && {
          level:
            level === 'intermediate'
              ? CourseLevel.INTERMEDIATE
              : level === 'beginner'
                ? CourseLevel.BEGINNER
                : level === 'advanced'
                  ? CourseLevel.ADVANCED
                  : undefined,
        }),
        ...(isHome && { ratingAverage: { gte: 2 } }),
        ...(rating && { ratingAverage: { gte: Number(rating) } }),
        ...((priceMin ?? priceMax) && {
          originalPrice: {
            ...(priceMin && { gte: Number(priceMin) }),
            ...(priceMax && { lte: Number(priceMax) }),
          },
        }),
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
      },
      ...(page && { skip: (Number(page) - 1) * Number(take) }),
      ...(take && { take: Number(take) }),
    });
  }, 'Get All Associated Courses for Public view');

  if (getCourses.length === 0) {
    throw new Error('No Courses Found');
  }
  return getCourses;
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
        if (lesson.type === 'VIDEO') {
          totalDuration += lesson.duration ?? 0;
        }
        if (lesson.type === 'ARTICLE') {
          totalDuration += lesson.duration ?? 0;
          totalArticles++;
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
        return {
          title: m.title,
          duration: m.lessons.reduce((a, b) => (b.duration ?? 0) + a, 0),
          lessons: m.lessons.map(l => {
            return {
              title: l.title,
              duration: l.duration,
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
  const user = req.user;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { courseId } = req.params;
  if (typeof courseId !== 'string') {
    throw new Error('A valid Course ID must be provided');
  }
  const getCourseDetails = await executeDbOperation(async prisma => {
    return await prisma.course.findFirst({
      where: {
        id: courseId,
        enrollments: {
          some: {
            userId: user.id,
            status: EnrollmentStatus.ACTIVE,
          },
        },
        deletedAt: null,
      },
      select: {
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
    title: getCourseDetails.title,
    createdAt: getCourseDetails.createdAt,
    updatedAt: getCourseDetails.updatedAt,
    content: {
      totalLessons: getCourseDetails.modules.reduce((acc, m) => acc + m.lessons.length, 0),
      totalDuration: formattedDuration,
    },
    modules: getCourseDetails.modules.map(m => ({
      isExpanded: false,
      position: m.position,
      title: m.title,
      moduleDuration: m.lessons.reduce((acc, l) => acc + (l.duration ?? 0), 0),
      lessons: m.lessons.map(l => ({
        position: l.position,
        title: l.title,
        description: l.description,
        notes: l.notes,
        duration: l.duration,
        type: l.type,
        contentUrl: l.contentUrl,
        files: l.files,
      })),
    })),
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

const getCartCourses = async (req: Request) => {
  const courseIds = req.body as string[];
  if (courseIds.length === 0) {
    throw new Error('Course Not Provided');
  }

  const getCourseDetails = await executeDbOperation(async prisma => {
    return await prisma.course.findMany({
      where: {
        id: { in: courseIds },
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        originalPrice: true,
        discountPrice: true,
        thumbnailUrl: true,
        category: {
          select: {
            name: true,
          },
        },
      },
    });
  }, 'Get Specific Course Data for Cart');

  if (getCourseDetails.length === 0) {
    throw new Error('Course Not Found for Cart');
  }

  const formatCourseData = (courses: typeof getCourseDetails) => {
    return courses.map(course => ({
      ...course,
      category: course.category?.name,
      discountPrice: course.discountPrice ?? 0,
    }));
  };
  return formatCourseData(getCourseDetails);
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
  const REGION = 'SG';
  const BASE_HOSTNAME = 'storage.bunnycdn.com';
  // const HOSTNAME = `${BASE_HOSTNAME}`;
  const HOSTNAME = `${REGION}.${BASE_HOSTNAME}`;

  const uniqueId = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now();
  const fileName = `${timestamp}-${uniqueId}-${req.file?.originalname}`;
  const storageZone = config.BUNNY_STORAGE_ZONE_USERNAME;
  const accessKey = config.BUNNY_STORAGE_ZONE_PASSWORD;
  const pullZone = config.BUNNY_PULL_ZONE;
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

  return `https://${pullZone}/${safePath}/${fileName}`;
};

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
  const expires = Math.floor(new Date().getTime() / 1000) + 1200 + duration * 60;
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

export const courseService = {
  isCourseSlugAvailable,
  createCourse,
  updateCourse,
  getAllCoursesForInstructor,
  getAllCoursesForPublic,
  getCategories,
  getCourseInstructors,
  getCourseTags,
  getBunnySignature,
  createFileToBunny,
  getSingleCourseForInstructorView,
  getSingleCourseForPublicView,
  getSingleCourseForPaidView,
  getSingleCourseForInstructorEdit,
  getCartCourses,
  deleteVideo,
  getVideo,
  getSecureVideoToken,
};
