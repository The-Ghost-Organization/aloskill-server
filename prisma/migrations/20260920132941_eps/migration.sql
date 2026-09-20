-- AlterEnum
ALTER TYPE "BookStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "books" ADD COLUMN     "authorProfileId" TEXT;

-- CreateTable
CREATE TABLE "book_authors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "photoUrl" TEXT,
    "websiteUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "book_authors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_authors_slug_key" ON "book_authors"("slug");

-- CreateIndex
CREATE INDEX "book_authors_name_idx" ON "book_authors"("name");

-- CreateIndex
CREATE INDEX "book_authors_isActive_deletedAt_idx" ON "book_authors"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "books_authorProfileId_idx" ON "books"("authorProfileId");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "book_authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
