/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Decimal } from '@prisma/client/runtime/client';
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { BookFormat, BookStatus, OrderStatus } from '../../generated/enums.js';
import type { UploadBookPayload } from './book.validation.js';

const uploadBook = async (req: Request) => {
  const data = req.body as UploadBookPayload["body"];
  const user = req.user;
  if(!user.email) {throw new Error("Unauthorized: User not authenticated.");};

  const upload = await executeDbOperation(async (prisma)=>{
    return await prisma.$transaction(async (tx)=>{
      const owner = await tx.user.findUnique({
        where: { email: user.email },
        include: { assignedRole: true }
      });

      if (!owner) {throw new Error("Unauthorized: Owner not found.");};
      const isAuthorized = owner.assignedRole.some(r =>
        r.role === "ADMIN" || r.role === "INSTRUCTOR"
      );

      if (!isAuthorized) {
        throw new Error("Security Violation: Only Admins or Instructors can upload books.");
      };
      const category = await tx.bookCategory.findUnique({
        where: { name: data.category }
      });
      if (!category) {throw new Error("Invalid Category ID.");};

      const newBook = await tx.book.create({
        data: {
          title: data.title,
          author: data.author,
          publisher: data.publisher,
          translator: data.translator,
          editor: data.editor,
          description: data.description,
          regularPrice: new Decimal(data.regularPrice),
          salePrice: new Decimal(data.salePrice),
          stock: data.stock,
          language: data.language,
          coverImage: data.coverImageUrl,
          isbn: data.isbn,
          edition: data.edition,
          pages: data.pages,
          metaKeywords: data.metaKeywords,
          metaDescription: data.metaDescription,
          ownerId: owner.id,
          categoryId: category.id,
          status: data.status === "DRAFT" ? BookStatus.DRAFT : BookStatus.PENDING,
          formats: data.formats.map(f=> f === "Hardcover"? BookFormat.HARDCOVER : BookFormat.E_BOOK),
          files: {
            create: data.files.map(file => ({
              name: file.name,
              url: file.url,
              fileType: file.fileType
            }))
          }
        },
        include: {
          files: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: owner.id,
          action: "BOOK_CREATED",
          entityType: "BOOK",
          entityId: newBook.id,
          changesAfter: JSON.parse(JSON.stringify(newBook)),
          ipAddress: "captured-from-request",
        }
      });

      return newBook;
    });
  }, "Upload Book");

  return upload.id;
};

const getAllBooksDataforAdmin = async (req: Request) => {
  const user = req.user;
  if(!user.email) {throw new Error("Unauthorized: User not authenticated.");};

  const booksData = await executeDbOperation(async (prisma) => {
    return await prisma.$transaction(async tx =>{
      const userProfile = await tx.user.findUnique({
        where: { email: user.email },
        include: { assignedRole: true }
      });

      if (!userProfile) {
        throw new Error("Unauthorized: User profile not found.");
      };
      const isAuthorized = userProfile.assignedRole.some(r =>
        r.role === "ADMIN"
      );

      if (!isAuthorized) {
        throw new Error("Security Violation: Only Admins can see this data.");
      };

      const stats = await tx.orderItem.aggregate({
        where: {
          bookId: { not: null },
          order: {
            status: OrderStatus.PAID
          }
        },
        _count: {
          id: true,
        },
        _sum: {
          price: true,
        }
      });
      const bookBreakdown = await tx.book.findMany({
        select: {
          id: true,
          title: true,
          author: true,
          totalEarning: true,
          formats: true,
          regularPrice: true,
          salePrice: true,
          stock: true,
          status: true,
          orderItem: {
            where: {
              order: { status: OrderStatus.PAID }
            },
            select: {
              id: true,
              price: true
            },
          }
        },
        orderBy: {createdAt: "asc"}
      });
      const stockData = await tx.book.aggregate({
        _sum: {
          stock: true,
        },
        _count: {
          id: true,
        }
      });

      return {
        totalBooks: stockData._count.id,
        totalSold: stats._count.id,
        totalStock: stockData._sum.stock ?? 0,
        totalRevenue: stats._sum.price ?? 0,
        bookBreakdown
      };
    });
  }, "Get All Books Data for Admin");

  return booksData;
};

const approveBook = async (req: Request) => {
  const { modifiedBookId } = req.query;
  if (typeof modifiedBookId !== "string") {
    throw new Error("Invalid book ID.");
  }
  const user = req.user;
  if(!user.email) {throw new Error("Unauthorized: User not authenticated.");}

  const approvedBook = await executeDbOperation(async (prisma) => {
    return await prisma.$transaction(async tx => {
      const userProfile = await tx.user.findUnique({
        where: { email: user.email },
        include: { assignedRole: true }
      });
      if (!userProfile) {throw new Error("Unauthorized: User profile not found.");}
      const isAuthorized = userProfile.assignedRole.some(r =>
        r.role === "ADMIN"
      );
      if (!isAuthorized) {
        throw new Error("Security Violation: Only Admins can approve books.");
      }
      const book = await tx.book.findUnique({
        where: { id: modifiedBookId },
      });
      if (!book) {throw new Error("Book not found.");}
      if (book.status !== BookStatus.PENDING) {
        throw new Error("Only books in PENDING status can be approved.");
      }
      const updatedBook = await tx.book.update({
        where: { id: modifiedBookId },
        data: { status: BookStatus.APPROVED }
      });

      await tx.auditLog.create({
        data: {
          userId: userProfile.id,
          action: "BOOK_APPROVED",
          entityType: "BOOK",
          entityId: updatedBook.id,
          changesAfter: JSON.parse(JSON.stringify(updatedBook)),
          ipAddress: "captured-from-request",
        }
      });

      return updatedBook;
    });
  }, "Approve Book");

  return approvedBook.id;
};

export const bookService = {
  uploadBook,
  getAllBooksDataforAdmin,
  approveBook
};
