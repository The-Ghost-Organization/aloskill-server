import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDatabaseClient as db } from '../../config/database.js';
import { config } from '../../config/env.js';
import type { Prisma, VideoUploadJob } from '../../generated/client.js';
import { AppError } from '../../middleware/errorHandler.js';

export const videoSettings = () => db().videoHostingSettings.upsert({ where: { id: 'central' }, create: { id: 'central' }, update: {} });
export async function identity(req: Request): Promise<string> {
  const auth = req.user as { id?: string; email?: string } | undefined;
  const user = await db().user.findFirst({ where: {
    ...(auth?.id ? { id: auth.id } : { email: auth?.email ?? '' }), status: 'ACTIVE', deletedAt: null,
  }, select: { id: true } });
  if (!user) throw new AppError('Authentication required.', 401);
  return user.id;
}
export function isAdmin(req: Request): boolean {
  return (req.user?.role as string[] | undefined)?.some(role => ['ADMIN', 'SUPERADMIN'].includes(role)) ?? false;
}
export async function assertCourseEditor(req: Request, courseId: string): Promise<void> {
  const userId = await identity(req);
  const course = await db().course.findFirst({ where: { id: courseId, deletedAt: null, ...(isAdmin(req) ? {} : { OR: [
    { createdBy: { userId } }, { courseInstructors: { some: { instructor: { userId } } } },
  ] }) }, select: { id: true } });
  if (!course) throw new AppError('Course not found or editing is not permitted.', 403);
}

export function stagingPath(id: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new AppError('Invalid upload identifier.', 400);
  return resolve(config.VIDEO_TEMP_DIR, `${id}.part`);
}
export async function ownedJob(req: Request, id: string): Promise<VideoUploadJob> {
  const userId = await identity(req);
  const job = await db().videoUploadJob.findFirst({ where: { id, ...(isAdmin(req) ? {} : { ownerUserId: userId }) } });
  if (!job) throw new AppError('Upload not found.', 404);
  if (job.courseId) await assertCourseEditor(req, job.courseId);
  return job;
}
export function publicJob(job: VideoUploadJob, workerAvailable = true) {
  let statusMessage: string;
  if (job.status === 'READY') statusMessage = 'Video ready';
  else if (job.status === 'FAILED') statusMessage = job.uploadError ?? 'Upload failed. Retry the upload.';
  else if (job.status === 'STAGING') statusMessage = 'Uploading source file to ALOSKILL';
  else if (!workerAvailable) statusMessage = 'Video worker is offline. Ask the administrator to start the video worker. Your uploaded file is saved.';
  else if (job.status === 'QUEUED') statusMessage = 'Upload received. Waiting for an available transfer worker.';
  else if (job.status === 'UPLOADING') statusMessage = 'Transferring video to hosting';
  else if (job.status === 'PROCESSING') statusMessage = 'Upload complete. Hosting service is processing the video.';
  else statusMessage = 'Upload is no longer active.';
  if (workerAvailable && job.uploadError && ['QUEUED', 'UPLOADING', 'PROCESSING'].includes(job.status)) {
    statusMessage = `A hosting request failed and will be retried: ${job.uploadError}`;
  }
  return { id: job.id, status: job.status, receivedBytes: Number(job.receivedBytes), fileSize: Number(job.fileSize),
    transferredBytes: Number(job.transferredBytes ?? 0), processingProgress: job.processingProgress ?? null,
    workerAvailable, statusMessage, lastSyncedAt: job.lastSyncedAt,
    uploadError: job.uploadError, contentUrl: job.status === 'READY' ? job.contentUrl : null,
    duration: job.duration, fileName: job.fileName, providerStatus: job.providerStatus };
}

// Chunk staging uses private persistent disk shared by all API and worker replicas.
// The DB lock prevents concurrent appends. Truncate uncommitted bytes after a crash.
export async function stageChunk(req: Request, id: string, offset: number, chunk: Buffer): Promise<void> {
  await ownedJob(req, id);
  await mkdir(resolve(config.VIDEO_TEMP_DIR), { recursive: true, mode: 0o700 });
  await db().$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`upload:${id}`}))`;
    const job = await tx.videoUploadJob.findUniqueOrThrow({ where: { id } });
    if (job.provider !== 'YOUTUBE' || job.status !== 'STAGING' || offset !== Number(job.receivedBytes) || offset + chunk.length > Number(job.fileSize) || !chunk.length) {
      throw new AppError('Upload offset changed. Resume from the saved offset.', 409);
    }
    // Validate common container magic as well as the declared MIME type.
    if (offset === 0) {
      const valid = job.mimeType === 'video/webm' ? chunk.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        : chunk.subarray(4, 8).toString('ascii') === 'ftyp';
      if (!valid) throw new AppError('The file does not match a supported video container.', 400);
    }
    const file = await open(stagingPath(id), offset === 0 ? 'w' : 'r+');
    try {
      await file.truncate(offset);
      let written = 0;
      while (written < chunk.length) {
        const result = await file.write(chunk, written, chunk.length - written, offset + written);
        if (!result.bytesWritten) throw new Error('Temporary storage made no write progress.');
        written += result.bytesWritten;
      }
      await file.sync();
    } finally { await file.close(); }
    await tx.videoUploadJob.update({ where: { id }, data: { receivedBytes: BigInt(offset + chunk.length) } });
  });
}

export async function playback(req: Request, lessonId?: string, legacyId?: string) {
  const userId = await identity(req);
  const lesson = await db().lesson.findFirst({ where: {
    deletedAt: null, type: 'VIDEO', ...(lessonId ? { id: lessonId } : { contentUrl: {
      equals: `https://video.bunnycdn.com/library/${config.BUNNY_STREAM_LIBRARY_ID}/videos/${legacyId ?? ''}`,
    } }),
  }, include: { module: { include: { course: { include: {
    enrollments: { where: { userId, status: 'ACTIVE' }, select: { id: true } },
    courseInstructors: { include: { instructor: { select: { userId: true } } } }, createdBy: { select: { userId: true } },
  } } } } } });
  if (!lesson && !lessonId && legacyId && /^[\w-]+$/.test(legacyId)) {
    const trailer = await db().course.findFirst({ where: { deletedAt: null, trailerUrl: { endsWith: `/${legacyId}` },
      ...(isAdmin(req) ? {} : { OR: [{ createdBy: { userId } }, { courseInstructors: { some: { instructor: { userId } } } }] }),
    }, select: { id: true } });
    if (trailer) {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      return { provider: 'BUNNY' as const, videoId: legacyId, libraryId: config.BUNNY_STREAM_LIBRARY_ID, expiresAt,
        token: createHash('sha256').update(config.BUNNY_STREAM_TOKEN_AUTH_KEY + legacyId + expiresAt).digest('hex') };
    }
  }
  if (!lesson || lesson.module.deletedAt || lesson.module.course.deletedAt) throw new AppError('Video unavailable.', 404);
  const course = lesson.module.course;
  const editor = isAdmin(req) || course.createdBy?.userId === userId || course.courseInstructors.some(i => i.instructor.userId === userId);
  const preview = lesson.module.position === 1 && lesson.position < 3;
  if (!editor && !course.enrollments.length && !(course.status === 'PUBLISHED' && preview)) throw new AppError('Enroll in this course to access this lesson.', 403);
  if (lesson.videoProvider === 'YOUTUBE') {
    if (!lesson.externalVideoId || lesson.providerVideoStatus !== 'ready') throw new AppError('Video is processing.', 409);
    return { provider: 'YOUTUBE' as const, videoId: lesson.externalVideoId };
  }
  const videoId = lesson.externalVideoId ?? lesson.contentUrl?.split('/').pop();
  if (!videoId || !/^[\w-]+$/.test(videoId)) throw new AppError('Invalid video asset.', 400);
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(3600, (lesson.duration ?? 0) + 600);
  return { provider: 'BUNNY' as const, videoId, libraryId: config.BUNNY_STREAM_LIBRARY_ID, expiresAt,
    token: createHash('sha256').update(config.BUNNY_STREAM_TOKEN_AUTH_KEY + videoId + expiresAt).digest('hex') };
}

export interface VideoLessonInput {
  id?: string; type: string; hostingType?: 'FREE' | 'PREMIUM'; videoUploadJobId?: string | null;
  freeHostingAcknowledged?: boolean; contentUrl?: { url?: string; name?: string } | null;
}
export async function validateVideoLessons(req: Request, lessons: VideoLessonInput[], price: number, courseId?: string): Promise<Map<string, VideoUploadJob>> {
  const settings = await videoSettings();
  const ownerUserId = await identity(req);
  const assets = new Map<string, VideoUploadJob>();
  for (const lesson of lessons.filter(l => l.type === 'VIDEO' && l.contentUrl?.url)) {
    const free = lesson.hostingType === 'FREE';
    if (free && price > 0 && (!settings.allowFreePaid || !lesson.freeHostingAcknowledged)) {
      throw new AppError(settings.allowFreePaid ? 'Acknowledge limited link protection for paid content.' : 'Free Hosting is disabled for paid lessons.', 400);
    }
    if (lesson.videoUploadJobId) {
      const job = await db().videoUploadJob.findUnique({ where: { id: lesson.videoUploadJobId } });
      // Existing assets can be retained by another authorized co-instructor.
      const existing = courseId ? await db().lesson.findFirst({ where: { id: lesson.id ?? '', module: { courseId }, videoUploadJobId: job?.id ?? '' } }) : null;
      if (!job || (!existing && job.ownerUserId !== ownerUserId) || job.status !== 'READY' ||
        (job.courseId && job.courseId !== courseId) || job.contentUrl !== lesson.contentUrl?.url ||
        (job.provider === 'YOUTUBE') !== free) throw new AppError('Use a ready upload owned by this course. Changing hosting requires a new upload.', 400);
      assets.set(job.id, job);
    } else {
      // Legacy Bunny assets are accepted only if already attached to this course.
      const existing = courseId ? await db().lesson.findFirst({ where: { id: lesson.id ?? '', module: { courseId }, contentUrl: lesson.contentUrl?.url, videoProvider: 'BUNNY' } }) : null;
      if (!existing || free) throw new AppError('Upload the replacement video before saving.', 400);
    }
  }
  return assets;
}

export function videoFields(lesson: VideoLessonInput, assets: Map<string, VideoUploadJob>) {
  const job = lesson.videoUploadJobId ? assets.get(lesson.videoUploadJobId) : undefined;
  return job ? { hostingType: job.provider === 'YOUTUBE' ? 'FREE' as const : 'PREMIUM' as const,
    videoProvider: job.provider, externalVideoId: job.externalVideoId, videoUploadJobId: job.id,
    providerVideoStatus: 'ready', uploadedAt: job.createdAt, lastSyncedAt: job.lastSyncedAt } : {};
}

export async function bindAssets(tx: Prisma.TransactionClient, courseId: string, assets: Map<string, VideoUploadJob>): Promise<void> {
  for (const id of assets.keys()) {
    // Atomic claim prevents a draft upload being attached to two courses at once.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset:${id}`}))`;
    const claimed = await tx.videoUploadJob.updateMany({ where: { id, status: 'READY', OR: [{ courseId: null }, { courseId }] }, data: { courseId } });
    if (!claimed.count) throw new AppError('This upload is already assigned to another course.', 409);
  }
}

export async function deleteStagedFile(id: string): Promise<void> {
  await unlink(stagingPath(id)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
}
