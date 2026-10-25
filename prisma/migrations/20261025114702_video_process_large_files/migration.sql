-- AlterTable
ALTER TABLE "video_hosting_settings" ALTER COLUMN "maxUploadBytes" SET DEFAULT 10737418240,
ALTER COLUMN "maxUploadBytes" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "video_upload_jobs" ADD COLUMN     "processingProgress" INTEGER,
ADD COLUMN     "transferredBytes" BIGINT NOT NULL DEFAULT 0,
ALTER COLUMN "fileSize" SET DATA TYPE BIGINT,
ALTER COLUMN "receivedBytes" SET DATA TYPE BIGINT;
