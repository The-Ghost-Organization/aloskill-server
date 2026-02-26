/*
  Warnings:

  - Added the required column `lastPosition` to the `lesson_progresses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "lesson_progresses" ADD COLUMN     "lastPosition" DECIMAL(6,2) NOT NULL DEFAULT 0;
