/*
  Warnings:

  - A unique constraint covering the columns `[instructorProfileId]` on the table `book_authors` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "book_authors" ADD COLUMN     "instructorProfileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "book_authors_instructorProfileId_key" ON "book_authors"("instructorProfileId");

-- CreateIndex
CREATE INDEX "book_authors_instructorProfileId_idx" ON "book_authors"("instructorProfileId");

-- AddForeignKey
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_instructorProfileId_fkey" FOREIGN KEY ("instructorProfileId") REFERENCES "instructor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
