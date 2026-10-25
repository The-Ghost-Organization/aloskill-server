-- CreateEnum
CREATE TYPE "VideoHostingType" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('YOUTUBE', 'BUNNY');

-- CreateEnum
CREATE TYPE "VideoJobStatus" AS ENUM ('STAGING', 'QUEUED', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED', 'RETIRED');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "defaultHosting" "VideoHostingType" NOT NULL DEFAULT 'PREMIUM',
ADD COLUMN     "playlistSyncError" TEXT,
ADD COLUMN     "playlistSyncedAt" TIMESTAMP(3),
ADD COLUMN     "youtubePlaylistId" TEXT;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "externalVideoId" TEXT,
ADD COLUMN     "hostingType" "VideoHostingType" NOT NULL DEFAULT 'PREMIUM',
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "providerVideoStatus" TEXT,
ADD COLUMN     "uploadedAt" TIMESTAMP(3),
ADD COLUMN     "videoProvider" "VideoProvider" NOT NULL DEFAULT 'BUNNY',
ADD COLUMN     "videoUploadJobId" TEXT;

-- CreateTable
CREATE TABLE "video_upload_jobs" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "courseId" TEXT,
    "provider" "VideoProvider" NOT NULL,
    "status" "VideoJobStatus" NOT NULL DEFAULT 'STAGING',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "receivedBytes" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "sessionUrl" TEXT,
    "externalVideoId" TEXT,
    "contentUrl" TEXT,
    "providerStatus" TEXT,
    "duration" INTEGER,
    "uploadError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_upload_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_hosting_settings" (
    "id" TEXT NOT NULL DEFAULT 'central',
    "defaultHosting" "VideoHostingType" NOT NULL DEFAULT 'PREMIUM',
    "allowFreePaid" BOOLEAN NOT NULL DEFAULT true,
    "freeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "premiumEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxUploadBytes" INTEGER NOT NULL DEFAULT 1073741824,
    "allowedMimeTypes" TEXT[] DEFAULT ARRAY['video/mp4', 'video/quicktime', 'video/webm']::TEXT[],
    "encryptedRefreshToken" TEXT,
    "channelId" TEXT,
    "channelTitle" TEXT,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_hosting_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_upload_jobs_ownerUserId_status_idx" ON "video_upload_jobs"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "video_upload_jobs_status_updatedAt_idx" ON "video_upload_jobs"("status", "updatedAt");
