/*
  Warnings:

  - The values [ARCHIVED] on the enum `CourseStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `rejectionReason` on the `instructor_profiles` table. All the data in the column will be lost.
  - Changed the type of `proposedCourseCategory` on the `instructor_profiles` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MobileBanking" AS ENUM ('BKASH', 'ROCKET', 'NAGAD', 'UPAY', 'QCASH');

-- CreateEnum
CREATE TYPE "BookFormat" AS ENUM ('HARDCOVER', 'E_BOOK');

-- CreateEnum
CREATE TYPE "ViewEntityType" AS ENUM ('COURSE', 'BOOK', 'PROFILE');

-- CreateEnum
CREATE TYPE "BookFileType" AS ENUM ('PREVIEW', 'EBOOK');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('PENDING', 'APPROVED', 'DRAFT');

-- CreateEnum
CREATE TYPE "PurchaseFormat" AS ENUM ('PHYSICAL', 'DIGITAL');

-- AlterEnum
BEGIN;
CREATE TYPE "CourseStatus_new" AS ENUM ('DRAFT', 'PUBLISHED', 'PENDING');
ALTER TABLE "public"."courses" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "courses" ALTER COLUMN "status" TYPE "CourseStatus_new" USING ("status"::text::"CourseStatus_new");
ALTER TYPE "CourseStatus" RENAME TO "CourseStatus_old";
ALTER TYPE "CourseStatus_new" RENAME TO "CourseStatus";
DROP TYPE "public"."CourseStatus_old";
ALTER TABLE "courses" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_instructorId_fkey";

-- DropIndex
DROP INDEX "order_items_orderId_courseId_key";

-- DropIndex
DROP INDEX "reviews_userId_courseId_key";

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "suspendReason" TEXT,
ADD COLUMN     "updatedContent" JSONB,
ALTER COLUMN "originalPrice" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "discountPrice" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "totalRevenueAmount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "enrollments" ALTER COLUMN "pricePaid" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "originalPriceAtTime" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "instructor_profiles" DROP COLUMN "rejectionReason",
ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "suspendReason" TEXT,
DROP COLUMN "proposedCourseCategory",
ADD COLUMN     "proposedCourseCategory" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "lesson_progresses" ALTER COLUMN "lastPosition" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "isNew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isUpdated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspendReason" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "bookId" TEXT,
ADD COLUMN     "format" "PurchaseFormat" NOT NULL DEFAULT 'DIGITAL',
ALTER COLUMN "courseId" DROP NOT NULL,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shippingAddressId" TEXT,
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "bookId" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "bookId" TEXT,
ALTER COLUMN "courseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "suspendReason" TEXT;

-- AlterTable
ALTER TABLE "wishlists" ADD COLUMN     "bookId" TEXT,
ALTER COLUMN "courseId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "translator" TEXT,
    "editor" TEXT,
    "publisher" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "physicalRegularPrice" DECIMAL(10,2),
    "physicalSalePrice" DECIMAL(10,2),
    "digitalRegularPrice" DECIMAL(10,2),
    "digitalSalePrice" DECIMAL(10,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "isbn" TEXT,
    "edition" TEXT,
    "pages" INTEGER,
    "language" TEXT NOT NULL,
    "formats" "BookFormat"[],
    "totalEarning" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "status" "BookStatus" NOT NULL DEFAULT 'PENDING',
    "suspendReason" TEXT,
    "adminNote" TEXT,
    "updatedContent" JSONB,
    "metaKeywords" TEXT,
    "metaDescription" TEXT,
    "coverImage" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileType" "BookFileType" NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_logs" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" "ViewEntityType" NOT NULL,
    "viewerId" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "view_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_addresses" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "shipping_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_methods" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "type" "PaymentMethod" NOT NULL,
    "bankName" TEXT,
    "mobileBankingName" "MobileBanking",
    "accHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchName" TEXT,
    "routingNumber" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_names" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "bank_names_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "book_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_isbn_idx" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_isbn_ownerId_idx" ON "books"("isbn", "ownerId");

-- CreateIndex
CREATE INDEX "view_logs_entityId_entityType_idx" ON "view_logs"("entityId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "bank_names_name_key" ON "bank_names"("name");

-- CreateIndex
CREATE UNIQUE INDEX "book_categories_name_key" ON "book_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "book_categories_slug_key" ON "book_categories"("slug");

-- CreateIndex
CREATE INDEX "book_categories_slug_idx" ON "book_categories"("slug");

-- CreateIndex
CREATE INDEX "book_categories_name_idx" ON "book_categories"("name");

-- CreateIndex
CREATE INDEX "book_categories_parentId_idx" ON "book_categories"("parentId");

-- CreateIndex
CREATE INDEX "reviews_userId_idx" ON "reviews"("userId");

-- CreateIndex
CREATE INDEX "reviews_bookId_idx" ON "reviews"("bookId");

-- CreateIndex
CREATE INDEX "reviews_bookId_rating_createdAt_idx" ON "reviews"("bookId", "rating", "createdAt");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "book_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_files" ADD CONSTRAINT "book_files_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "shipping_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "book_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
