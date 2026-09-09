/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { BookStatus, CourseStatus } from '../../generated/browser.js';

const getCartItems = async (req: Request) => {
  const data = req.body as { courses?: string[]; books?: { bookId: string; format: string }[] };

  const responseData = {
    courses: [] as any[],
    books: [] as any[],
  };

  if (data.books && data.books.length > 0) {
    const getBookDetails = await executeDbOperation(async prisma => {
      return await prisma.book.findMany({
        where: {
          id: { in: data.books?.map((b: any) => b.bookId) },
          status: BookStatus.APPROVED,
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          physicalRegularPrice: true,
          physicalSalePrice: true,
          digitalRegularPrice: true,
          digitalSalePrice: true,
          coverImage: true,
          weight: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      });
    }, 'Get Specific Book Data for Cart');

    if (getBookDetails && getBookDetails.length > 0) {
      responseData.books = getBookDetails.map(dbBook => {
        return {
          id: dbBook.id,
          title: dbBook.title,
          thumbnailUrl: dbBook.coverImage,
          category: dbBook.category?.name,
          weight: dbBook.weight,
          physicalRegularPrice: dbBook.physicalRegularPrice,
          physicalSalePrice: dbBook.physicalSalePrice,
          digitalRegularPrice: dbBook.digitalRegularPrice,
          digitalSalePrice: dbBook.digitalSalePrice,
        };
      });
    }
  }

  if (data.courses && data.courses.length > 0) {
    const getCourseDetails = await executeDbOperation(async prisma => {
      return await prisma.course.findMany({
        where: {
          id: { in: data.courses?.map((c: any) => c) },
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

    if (getCourseDetails && getCourseDetails.length > 0) {
      responseData.courses = getCourseDetails.map(course => ({
        ...course,
        category: course.category?.name,
        discountPrice: course.discountPrice,
      }));
    }
  }

  return responseData;
};

export const cartService = {
  getCartItems,
};
