/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Decimal } from '@prisma/client/runtime/client';
import { type Request } from 'express';
import * as XLSX from 'xlsx';
import { executeDbOperation } from '../../config/database.js';
import { BookFormat, BookStatus, OrderStatus } from '../../generated/enums.js';
import {
  CreateBookBodySchema,
  type CreateBookInput,
  type UploadBookPayload,
} from './book.validation.js';

type DatabaseClient = Parameters<Parameters<typeof executeDbOperation>[0]>[0];
type TransactionArgument = Parameters<DatabaseClient['$transaction']>[0];
type TransactionClient = TransactionArgument extends (tx: infer T) => unknown ? T : never;

const getAuthorizedOwner = async (tx: TransactionClient, email: string) => {
  const owner = await tx.user.findUnique({
    where: { email, deletedAt: null, status: 'ACTIVE' },
    include: { assignedRole: true },
  });
  if (!owner) {
    throw new Error('Unauthorized: Owner not found.');
  }
  if (!owner.assignedRole.some(r => r.role === 'ADMIN' || r.role === 'INSTRUCTOR')) {
    throw new Error('Security Violation: Only Admins or Instructors can upload books.');
  }
  return owner;
};

const createBook = async (
  tx: TransactionClient,
  owner: Awaited<ReturnType<typeof getAuthorizedOwner>>,
  data: CreateBookInput
) => {
  const category = await tx.bookCategory.findUnique({ where: { name: data.category } });
  if (!category) {
    throw new Error(`Invalid category: ${data.category}.`);
  }

  const newBook = await tx.book.create({
    data: {
      title: data.title,
      author: data.author,
      publisher: data.publisher,
      publishYear: Number(data.publishYear),
      ratings: new Decimal(data.ratings),
      translator: data.translator,
      editor: data.editor,
      description: data.description,
      physicalRegularPrice: new Decimal(data.physicalRegularPrice),
      physicalSalePrice: new Decimal(data.physicalSalePrice ?? 0),
      digitalRegularPrice: new Decimal(data.digitalRegularPrice ?? 0),
      digitalSalePrice: new Decimal(data.digitalSalePrice ?? 0),
      stock: data.stock,
      language: data.language,
      coverImage: data.coverImageUrl,
      isbn: data.isbn,
      edition: data.edition,
      pages: data.pages,
      weight: data.weight,
      metaKeywords: data.metaKeywords,
      metaDescription: data.metaDescription,
      ownerId: owner.id,
      categoryId: category.id,
      status: data.status === 'DRAFT' ? BookStatus.DRAFT : BookStatus.PENDING,
      formats: data.formats.map(f =>
        f === 'Hardcover' ? BookFormat.HARDCOVER : BookFormat.E_BOOK
      ),
      files: {
        create: data.files.map(file => ({
          name: file.name,
          url: file.url,
          fileType: file.fileType,
        })),
      },
    },
    include: { files: true },
  });
  await tx.auditLog.create({
    data: {
      userId: owner.id,
      action: 'BOOK_CREATED',
      entityType: 'BOOK',
      entityId: newBook.id,
      changesAfter: JSON.parse(JSON.stringify(newBook)),
      ipAddress: 'captured-from-request',
    },
  });
  return newBook;
};

const getBooksCategories = async () => {
  const categories = await executeDbOperation(async prisma => {
    return await prisma.bookCategory.findMany({
      select: {
        id: true,
        name: true,
      },
    });
  }, 'Get Books Categories');

  return categories;
};

const uploadBook = async (req: Request) => {
  const data = req.body as UploadBookPayload['body'];
  const user = req.user;
  if (!user.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const upload = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      const owner = await getAuthorizedOwner(tx, user.email);
      return createBook(tx, owner, data);
    });
  }, 'Upload Book');

  return upload.id;
};

const text = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  if (!normalized || ['undefined', 'null'].includes(normalized.toLowerCase())) {
    return undefined;
  }

  return normalized;
};

const list = (value: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

type MediaUrlMap = Record<string, string>;

const normalizeMediaKey = (value: unknown): string | undefined => {
  const raw = text(value);
  if (!raw) {
    return undefined;
  }

  return raw.replace(/\\/g, '/').split('/').pop()?.trim().toLowerCase() ?? undefined;
};

const normalizeHttpsUrl = (value: unknown): string | undefined => {
  const raw = text(value)?.replace(/^["']|["']$/g, '');
  if (!raw) {
    return undefined;
  }

  let normalized = raw;
  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  } else if (/^[\w.-]+\.b-cdn\.net\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const mappedMediaUrl = (mediaUrls: MediaUrlMap, fileName: unknown): string | undefined => {
  const key = normalizeMediaKey(fileName);
  return key ? normalizeHttpsUrl(mediaUrls[key]) : undefined;
};

const mediaFileReference = (
  fileNameColumn: unknown,
  legacyUrlColumn: unknown
): string | undefined => {
  const explicitFileName = text(fileNameColumn);
  if (explicitFileName) {
    return explicitFileName;
  }

  // Backward compatibility: an old sheet may contain a filename in a URL column.
  const legacyValue = text(legacyUrlColumn);
  return legacyValue && !normalizeHttpsUrl(legacyValue) ? legacyValue : undefined;
};

const resolveMediaUrl = (
  directUrl: unknown,
  fileName: unknown,
  mediaUrls: MediaUrlMap
): string | undefined => {
  const directHttpsUrl = normalizeHttpsUrl(directUrl);
  if (directHttpsUrl) {
    return directHttpsUrl;
  }

  const reference = mediaFileReference(fileName, directUrl);
  return mappedMediaUrl(mediaUrls, reference);
};

const files = (row: Record<string, unknown>, mediaUrls: MediaUrlMap): CreateBookInput['files'] => {
  const result: CreateBookInput['files'] = [];
  const previewUrl = resolveMediaUrl(row.previewFileUrl, row.previewPdfFile, mediaUrls);
  const ebookUrl = resolveMediaUrl(row.ebookFileUrl, row.ebookPdfFile, mediaUrls);

  if (previewUrl) {
    result.push({
      name: text(row.previewFileName) ?? text(row.previewPdfFile) ?? 'Preview',
      url: previewUrl,
      fileType: 'PREVIEW',
    });
  }

  if (ebookUrl) {
    result.push({
      name: text(row.ebookFileName) ?? text(row.ebookPdfFile) ?? 'E-Book',
      url: ebookUrl,
      fileType: 'EBOOK',
    });
  }

  return result;
};

const excelRowToBook = (row: Record<string, unknown>, mediaUrls: MediaUrlMap): unknown => ({
  title: text(row.title),
  author: text(row.author),
  translator: text(row.translator),
  editor: text(row.editor),
  publisher: text(row.publisher),
  publishYear: text(row.publishYear),
  ratings: text(row.ratings),
  description: text(row.description),
  physicalRegularPrice: row.physicalRegularPrice,
  physicalSalePrice: row.physicalSalePrice === '' ? undefined : row.physicalSalePrice,
  digitalRegularPrice: row.digitalRegularPrice === '' ? undefined : row.digitalRegularPrice,
  digitalSalePrice: row.digitalSalePrice === '' ? undefined : row.digitalSalePrice,
  stock: row.stock === '' ? undefined : row.stock,
  isbn: text(row.isbn),
  edition: text(row.edition),
  pages: row.pages,
  weight: row.weight === '' ? undefined : row.weight,
  language: text(row.language),
  category: text(row.category),
  formats: list(row.formats),
  status: text(row.status) ?? 'PENDING',
  metaKeywords: text(row.metaKeywords),
  metaDescription: text(row.metaDescription),

  // CreateBookBodySchema receives only a final HTTPS URL here.
  coverImageUrl: resolveMediaUrl(row.coverImageUrl, row.coverImageFile, mediaUrls),
  files: files(row, mediaUrls),
});

const parseMediaUrls = (value: unknown): MediaUrlMap => {
  if (!value) {
    return {};
  }

  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('The mediaUrls field contains invalid JSON.');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The mediaUrls field must be a filename-to-URL object.');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 1500) {
    throw new Error('A maximum of 1,500 media files is allowed.');
  }

  const result: MediaUrlMap = {};
  for (const [fileName, rawUrl] of entries) {
    const cleanName = normalizeMediaKey(fileName);
    const cleanUrl = normalizeHttpsUrl(rawUrl);

    if (!cleanName || !cleanUrl) {
      throw new Error(`Invalid Bunny media mapping for "${fileName || 'unknown file'}".`);
    }

    result[cleanName] = cleanUrl;
  }

  return result;
};

const bulkUploadBooks = async (req: Request) => {
  const userEmail = req.user.email;
  if (!userEmail) {
    throw new Error('Unauthorized: User not authenticated.');
  }
  if (!req.file?.buffer) {
    throw new Error('An Excel file is required in the "file" field.');
  }

  const mediaUrls = parseMediaUrls(req.body?.mediaUrls);
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error('The workbook must contain at least one worksheet.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!rows.length) {
    throw new Error('The first worksheet does not contain any book rows.');
  }
  if (rows.length > 500) {
    throw new Error('A maximum of 500 books can be imported at once.');
  }

  const results: Array<{
    row: number;
    success: boolean;
    bookId?: string;
    errors?: Array<{ field: string; message: string }>;
  }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const mediaChecks = [
      {
        field: 'coverImageUrl',
        excelColumn: 'coverImageFile',
        required: true,
        reference: mediaFileReference(row.coverImageFile, row.coverImageUrl),
        directUrl: normalizeHttpsUrl(row.coverImageUrl),
      },
      {
        field: 'files.previewUrl',
        excelColumn: 'previewPdfFile',
        required: false,
        reference: mediaFileReference(row.previewPdfFile, row.previewFileUrl),
        directUrl: normalizeHttpsUrl(row.previewFileUrl),
      },
      {
        field: 'files.ebookUrl',
        excelColumn: 'ebookPdfFile',
        required: false,
        reference: mediaFileReference(row.ebookPdfFile, row.ebookFileUrl),
        directUrl: normalizeHttpsUrl(row.ebookFileUrl),
      },
    ] as const;

    const mediaErrors: Array<{ field: string; message: string }> = [];
    for (const check of mediaChecks) {
      if (check.directUrl) {
        continue;
      }

      if (!check.reference) {
        if (check.required) {
          mediaErrors.push({
            field: check.field,
            message: `Enter the exact selected image filename in ${check.excelColumn}.`,
          });
        }
        continue;
      }

      if (!mappedMediaUrl(mediaUrls, check.reference)) {
        mediaErrors.push({
          field: check.field,
          message: `No uploaded media file matched "${check.reference}" from ${check.excelColumn}.`,
        });
      }
    }

    if (mediaErrors.length) {
      results.push({ row: rowNumber, success: false, errors: mediaErrors });
      continue;
    }

    const parsed = CreateBookBodySchema.safeParse(excelRowToBook(row, mediaUrls));
    if (!parsed.success) {
      results.push({
        row: rowNumber,
        success: false,
        errors: parsed.error.issues.map(issue => ({
          field: issue.path.join('.') || 'row',
          message: issue.message,
        })),
      });
      continue;
    }

    try {
      const book = await executeDbOperation(
        prisma =>
          prisma.$transaction(async tx => {
            const owner = await getAuthorizedOwner(tx, userEmail);
            return createBook(tx, owner, parsed.data);
          }),
        `Bulk Upload Book - Row ${rowNumber}`
      );
      results.push({ row: rowNumber, success: true, bookId: book.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed.';
      results.push({
        row: rowNumber,
        success: false,
        errors: [{ field: 'row', message: message.replace(/\u001B\[[0-?]*[ -\/]*[@-~]/g, '') }],
      });
    }
  }

  const imported = results.filter(result => result.success).length;
  return { total: rows.length, imported, failed: rows.length - imported, results };
};

const updateBook = async (req: Request) => {
  const { bookId } = req.query;
  if (typeof bookId !== 'string') {
    throw new Error('Invalid book ID.');
  }
  const data = req.body as UploadBookPayload['body'];
  const user = req.user;
  if (!user.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const updatedBook = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      const owner = await tx.user.findUnique({
        where: { email: user.email, deletedAt: null, status: 'ACTIVE' },
        include: { assignedRole: true },
      });
      if (!owner) {
        throw new Error('Unauthorized: Owner not found.');
      }
      const isAuthorized = owner.assignedRole.some(
        r => r.role === 'ADMIN' || r.role === 'INSTRUCTOR'
      );
      if (!isAuthorized) {
        throw new Error('Security Violation: Only Admins or Instructors can update books.');
      }
      const category = await tx.bookCategory.findUnique({
        where: { name: data.category },
      });
      if (!category) {
        throw new Error('Invalid Category ID.');
      }
      const existingBook = await tx.book.findUnique({
        where: { id: bookId, deletedAt: null },
        include: { files: true },
      });
      if (!existingBook) {
        throw new Error('Book not found.');
      }
      const updated = await tx.book.update({
        where: { id: bookId },
        data: {
          title: data.title,
          author: data.author,
          publisher: data.publisher,
          publishYear: Number(data.publishYear),
          ratings: new Decimal(data.ratings),
          translator: data.translator,
          editor: data.editor,
          description: data.description,
          physicalRegularPrice: new Decimal(data.physicalRegularPrice),
          physicalSalePrice: new Decimal(data.physicalSalePrice ?? 0),
          digitalRegularPrice: new Decimal(data.digitalRegularPrice ?? 0),
          digitalSalePrice: new Decimal(data.digitalSalePrice ?? 0),
          stock: data.stock,
          language: data.language,
          coverImage: data.coverImageUrl,
          isbn: data.isbn,
          edition: data.edition,
          pages: data.pages,
          weight: data.weight,
          metaKeywords: data.metaKeywords,
          metaDescription: data.metaDescription,
          ownerId: owner.id,
          categoryId: category.id,
          status: data.status === 'DRAFT' ? BookStatus.DRAFT : BookStatus.PENDING,
          formats: data.formats.map(f =>
            f === 'Hardcover' ? BookFormat.HARDCOVER : BookFormat.E_BOOK
          ),
          files: {
            create: data.files.map(file => ({
              name: file.name,
              url: file.url,
              fileType: file.fileType,
            })),
          },
        },
        include: {
          files: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: owner.id,
          action: 'BOOK_UPDATED',
          entityType: 'BOOK',
          entityId: updated.id,
          changesBefore: JSON.parse(JSON.stringify(existingBook)),
          changesAfter: JSON.parse(JSON.stringify(updated)),
          ipAddress: 'captured-from-request',
        },
      });

      return updated;
    });
  }, 'Update Book');

  return updatedBook.id;
};

const getAllBooksForPublicView = async () => {
  const books = await executeDbOperation(async prisma => {
    return await prisma.book.findMany({
      where: { status: BookStatus.APPROVED, deletedAt: null },
      select: {
        id: true,
        title: true,
        author: true,
        coverImage: true,
        physicalRegularPrice: true,
        physicalSalePrice: true,
        digitalRegularPrice: true,
        digitalSalePrice: true,
        formats: true,
        publisher: true,
        createdAt: true,
        stock: true,
        category: {
          select: {
            name: true,
          },
        },
      },
    });
  }, 'Get All Books for Public View');

  return books.map(book => ({
    ...book,
    stock: book.stock > 0 ? 'in-stock' : 'out-of-stock',
  }));
};

const getBookDetailsForPublicView = async (req: Request) => {
  const bookId = req.params.bookId as string;
  if (!bookId) {
    throw new Error('Book ID is required.');
  }
  const book = await executeDbOperation(async prisma => {
    return await prisma.book.findUnique({
      where: { id: bookId, status: BookStatus.APPROVED, deletedAt: null },
      select: {
        id: true,
        title: true,
        author: true,
        publisher: true,
        translator: true,
        editor: true,
        description: true,
        physicalRegularPrice: true,
        physicalSalePrice: true,
        digitalRegularPrice: true,
        digitalSalePrice: true,
        stock: true,
        language: true,
        coverImage: true,
        isbn: true,
        edition: true,
        pages: true,
        owner: {
          select: {
            avatarUrl: true,
            status: true,
            instructorProfile: {
              select: {
                displayName: true,
                qualifications: true,
                expertise: true,
              },
            },
          },
        },
        formats: true,
        createdAt: true,
        category: {
          select: {
            name: true,
          },
        },
        files: {
          select: {
            name: true,
            url: true,
            fileType: true,
          },
        },
      },
    });
  }, 'Get Book Details for Public View');

  return book;
};

// Admin Dashboard

const getAllBooksDataforAdmin = async (req: Request) => {
  const user = req.user;
  if (!user.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const booksData = await executeDbOperation(async prisma => {
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
        throw new Error('Security Violation: Only Admins can see this data.');
      }

      const stats = await tx.orderItem.aggregate({
        where: {
          bookId: { not: null },
          order: {
            status: OrderStatus.PAID,
          },
        },
        _count: {
          id: true,
        },
        _sum: {
          price: true,
        },
      });
      const bookBreakdown = await tx.book.findMany({
        select: {
          id: true,
          title: true,
          author: true,
          totalEarning: true,
          formats: true,
          physicalRegularPrice: true,
          physicalSalePrice: true,
          digitalRegularPrice: true,
          digitalSalePrice: true,
          stock: true,
          status: true,
          orderItem: {
            where: {
              order: { status: OrderStatus.PAID },
            },
            select: {
              id: true,
              price: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      const stockData = await tx.book.aggregate({
        _sum: {
          stock: true,
        },
        _count: {
          id: true,
        },
      });

      return {
        totalBooks: stockData._count.id,
        totalSold: stats._count.id,
        totalStock: stockData._sum.stock ?? 0,
        totalRevenue: stats._sum.price ?? 0,
        bookBreakdown,
      };
    });
  }, 'Get All Books Data for Admin');

  return booksData;
};

const getSingleBookDataForAdminEdit = async (req: Request) => {
  const { bookId } = req.query;
  if (typeof bookId !== 'string') {
    throw new Error('Invalid book ID.');
  }
  const user = req.user;
  if (!user.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const bookData = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      const userProfile = await tx.user.findUnique({
        where: { email: user.email, deletedAt: null, status: 'ACTIVE' },
        include: { assignedRole: true },
      });
      if (!userProfile) {
        throw new Error('Unauthorized: User profile not found.');
      }
      const isAuthorized = userProfile.assignedRole.some(
        r => r.role === 'ADMIN' || r.role === 'INSTRUCTOR'
      );
      if (!isAuthorized) {
        throw new Error('Security Violation: Only Admins and Instructors can see this data.');
      }

      const book = await tx.book.findUnique({
        where: { id: bookId },
        include: {
          files: true,
          category: true,
        },
      });
      if (!book) {
        throw new Error('Book not found.');
      }
      return book;
    });
  }, 'Get Single Book Data for Admin Edit');

  return bookData;
};

const approveBook = async (req: Request) => {
  const { modifiedBookId } = req.query;
  if (typeof modifiedBookId !== 'string') {
    throw new Error('Invalid book ID.');
  }
  const user = req.user;
  if (!user.email) {
    throw new Error('Unauthorized: User not authenticated.');
  }

  const approvedBook = await executeDbOperation(async prisma => {
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
        throw new Error('Security Violation: Only Admins can approve books.');
      }
      const book = await tx.book.findUnique({
        where: { id: modifiedBookId },
      });
      if (!book) {
        throw new Error('Book not found.');
      }
      if (book.status !== BookStatus.PENDING) {
        throw new Error('Only books in PENDING status can be approved.');
      }
      const updatedBook = await tx.book.update({
        where: { id: modifiedBookId },
        data: { status: BookStatus.APPROVED },
      });

      await tx.auditLog.create({
        data: {
          userId: userProfile.id,
          action: 'BOOK_APPROVED',
          entityType: 'BOOK',
          entityId: updatedBook.id,
          changesAfter: JSON.parse(JSON.stringify(updatedBook)),
          ipAddress: 'captured-from-request',
        },
      });

      return updatedBook;
    });
  }, 'Approve Book');

  return approvedBook.id;
};

export const bookService = {
  getBooksCategories,
  uploadBook,
  bulkUploadBooks,
  updateBook,
  getAllBooksDataforAdmin,
  getSingleBookDataForAdminEdit,
  approveBook,
  getAllBooksForPublicView,
  getBookDetailsForPublicView,
};
