import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getDatabaseClient as db } from '../../config/database.js';
import { config } from '../../config/env.js';
import redis from '../../emails/redisConnection.js';
import { requireAdmin, requireAuth, requireInstructor } from '../../middleware/auth.js';
import { AppError } from '../../middleware/errorHandler.js';
import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { courseService } from './course.service.js';
import { assertCourseEditor, identity, ownedJob, playback, publicJob, stageChunk, videoSettings } from './video.service.js';
import { clearTokenCache, encryptToken, googleTokenRequest, verifyChannel } from './video.youtube.js';

export const VideoRoutes = Router();
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 } });
const initialize = z.object({
  hostingType: z.enum(['FREE', 'PREMIUM']), courseId: z.string().uuid().optional(),
  fileName: z.string().min(1).max(255), mimeType: z.string().max(100), fileSize: z.number().int().positive(),
  title: z.string().trim().min(1).max(150), description: z.string().max(5000).default(''),
  acknowledged: z.boolean().default(false), youtubeDisclosureAccepted: z.boolean().default(false),
});
const policySchema = z.object({
  defaultHosting: z.enum(['FREE', 'PREMIUM']), allowFreePaid: z.boolean(), freeEnabled: z.boolean(), premiumEnabled: z.boolean(),
  maxUploadBytes: z.number().int().min(1024).max(2_000_000_000),
  allowedMimeTypes: z.array(z.enum(['video/mp4', 'video/quicktime', 'video/webm'])).min(1),
}).strict();

VideoRoutes.get('/policy', requireInstructor, catchAsync(async (_req, res) => {
  const s = await videoSettings();
  ResponseHandler.ok(res, 'Hosting policy', { defaultHosting: s.defaultHosting, allowFreePaid: s.allowFreePaid,
    freeEnabled: s.freeEnabled && Boolean(s.encryptedRefreshToken), premiumEnabled: s.premiumEnabled,
    freeUnavailableReason: !s.encryptedRefreshToken
      ? 'Free Hosting is unavailable until an administrator connects the central video account in Settings → Video Hosting.'
      : !s.freeEnabled ? 'Free Hosting is disabled by the administrator in Settings → Video Hosting.' : null,
    maxUploadBytes: s.maxUploadBytes, allowedMimeTypes: s.allowedMimeTypes });
}));

VideoRoutes.post('/uploads', requireInstructor, catchAsync(async (req, res) => {
  const input = initialize.parse(req.body);
  const ownerUserId = await identity(req);
  if (input.courseId) await assertCourseEditor(req, input.courseId);
  const settings = await videoSettings();
  if (input.fileSize > settings.maxUploadBytes || !settings.allowedMimeTypes.includes(input.mimeType)) throw new AppError('Video format or size is not permitted.', 400);
  if (input.hostingType === 'FREE') {
    if (!settings.freeEnabled || !settings.encryptedRefreshToken) throw new AppError('Free Hosting is currently unavailable.', 503);
    if (!input.youtubeDisclosureAccepted) throw new AppError('Accept the upload destination and privacy disclosure.', 400);
    if (input.courseId) {
      const course = await db().course.findUniqueOrThrow({ where: { id: input.courseId } });
      if (Number(course.originalPrice) > 0 && (!settings.allowFreePaid || !input.acknowledged)) throw new AppError('Paid lesson hosting policy requires Premium Hosting or acknowledgement.', 400);
    }
  } else if (!settings.premiumEnabled) throw new AppError('Premium Hosting is currently unavailable.', 503);
  // Bound the number of abandoned jobs an account can create.
  const pending = await db().videoUploadJob.count({ where: { ownerUserId, status: { in: ['STAGING', 'QUEUED', 'UPLOADING', 'PROCESSING'] } } });
  if (pending >= 20) throw new AppError('Finish or cancel pending uploads first.', 429);
  const job = await db().videoUploadJob.create({ data: {
    ownerUserId, courseId: input.courseId, provider: input.hostingType === 'FREE' ? 'YOUTUBE' : 'BUNNY',
    fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize, title: input.title,
    description: input.description, acknowledged: input.acknowledged,
  } });
  let signature: Awaited<ReturnType<typeof courseService.getBunnySignature>> | undefined;
  if (job.provider === 'BUNNY') {
    try {
      signature = await courseService.getBunnySignature(req, {
        fileName: input.title,
        collectionName: ownerUserId,
      });
    } catch (error) {
      await db().videoUploadJob.update({ where: { id: job.id }, data: {
        status: 'FAILED', uploadError: 'Premium Hosting upload could not be initialized. Please try again.',
      } });
      throw error;
    }
    await db().videoUploadJob.update({ where: { id: job.id }, data: {
      externalVideoId: signature.videoId,
      contentUrl: `https://video.bunnycdn.com/library/${signature.libraryId}/videos/${signature.videoId}`,
    } });
  }
  ResponseHandler.ok(res, 'Upload initialized', { ...publicJob(job), signature });
}));

VideoRoutes.get('/uploads/:id', requireInstructor, catchAsync(async (req, res) => {
  const job = await ownedJob(req, String(req.params.id));
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const signature = job.provider === 'BUNNY' && job.externalVideoId && job.status === 'STAGING' ? {
    videoId: job.externalVideoId, libraryId: config.BUNNY_STREAM_LIBRARY_ID, expires,
    token: createHash('sha256').update(`${Number(config.BUNNY_STREAM_LIBRARY_ID)}${config.BUNNY_STREAM_API_KEY}${expires}${job.externalVideoId}`).digest('hex'),
  } : undefined;
  ResponseHandler.ok(res, 'Upload status', { ...publicJob(job), signature });
}));
VideoRoutes.post('/uploads/:id/chunks', requireInstructor, chunkUpload.single('file'), catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('Video chunk required.', 400);
  const offset = z.coerce.number().int().nonnegative().parse(req.body.offset);
  await stageChunk(req, String(req.params.id), offset, req.file.buffer);
  ResponseHandler.ok(res, 'Chunk saved', publicJob(await ownedJob(req, String(req.params.id))));
}));
VideoRoutes.post('/uploads/:id/complete', requireInstructor, catchAsync(async (req, res) => {
  const job = await ownedJob(req, String(req.params.id));
  if (job.status === 'STAGING') {
    if (job.provider === 'YOUTUBE' && job.receivedBytes !== job.fileSize) throw new AppError('Upload is incomplete.', 409);
    if (job.provider === 'BUNNY' && !job.externalVideoId) throw new AppError('Upload has not initialized.', 409);
    await db().videoUploadJob.updateMany({ where: { id: job.id, status: 'STAGING' }, data: { status: job.provider === 'BUNNY' ? 'PROCESSING' : 'QUEUED' } });
  }
  // PostgreSQL is the queue outbox; the worker dispatcher recovers after restarts.
  ResponseHandler.ok(res, 'Upload queued', publicJob(await ownedJob(req, job.id)));
}));
VideoRoutes.post('/uploads/:id/retry', requireInstructor, catchAsync(async (req, res) => {
  const job = await ownedJob(req, String(req.params.id));
  if (job.status === 'FAILED') await db().videoUploadJob.update({ where: { id: job.id }, data: {
    status: job.externalVideoId ? 'PROCESSING' : job.receivedBytes === job.fileSize ? 'QUEUED' : 'STAGING', uploadError: null,
  } });
  ResponseHandler.ok(res, 'Upload retry requested', publicJob(await ownedJob(req, job.id)));
}));
VideoRoutes.delete('/uploads/:id', requireInstructor, catchAsync(async (req, res) => {
  const job = await ownedJob(req, String(req.params.id));
  if (await db().lesson.count({ where: { videoUploadJobId: job.id, deletedAt: null } })) throw new AppError('Remove or replace the lesson video and save the course first.', 409);
  if (['QUEUED', 'UPLOADING', 'PROCESSING'].includes(job.status)) throw new AppError('Wait for processing to finish before deleting.', 409);
  await db().videoUploadJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
  ResponseHandler.ok(res, 'Video scheduled for deletion');
}));
VideoRoutes.post('/playback', requireAuth, catchAsync(async (req, res) => {
  const body = z.object({ lessonId: z.string().uuid() }).parse(req.body);
  ResponseHandler.ok(res, 'Playback authorized', await playback(req, body.lessonId));
}));

VideoRoutes.get('/admin', requireAdmin, catchAsync(async (_req, res) => {
  const settings = await videoSettings();
  const { encryptedRefreshToken: secret, ...safe } = settings;
  const [counts, failed, playlistFailures] = await Promise.all([
    db().videoUploadJob.groupBy({ by: ['provider', 'status'], _count: true }),
    db().videoUploadJob.findMany({ where: { status: 'FAILED' }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, fileName: true, uploadError: true } }),
    db().course.findMany({ where: { playlistSyncError: { not: null } }, take: 20, select: { id: true, title: true, playlistSyncError: true } }),
  ]);
  ResponseHandler.ok(res, 'Video Hosting settings', { ...safe, connected: Boolean(secret), playlistPrivacy: 'private', counts, failed, playlistFailures,
    premiumConfigured: Boolean(config.BUNNY_STREAM_API_KEY && config.BUNNY_STREAM_LIBRARY_ID),
    signedPlaybackConfigured: Boolean(config.BUNNY_STREAM_TOKEN_AUTH_KEY) });
}));
VideoRoutes.patch('/admin', requireAdmin, catchAsync(async (req, res) => {
  const policy = policySchema.parse(req.body);
  await videoSettings();
  await db().videoHostingSettings.update({ where: { id: 'central' }, data: policy });
  ResponseHandler.ok(res, 'Hosting policy saved');
}));
VideoRoutes.post('/admin/connect', requireAdmin, catchAsync(async (req, res) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI || !config.YOUTUBE_CHANNEL_ID) throw new AppError('Configure Google OAuth and the central channel on the server first.', 503);
  const state = randomBytes(32).toString('hex');
  await redis.set(`video-oauth:${state}`, await identity(req), 'EX', 600);
  const params = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: config.GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.force-ssl', access_type: 'offline', prompt: 'consent', state });
  ResponseHandler.ok(res, 'Authorize the central channel', { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
}));
// OAuth callback has no access-token header; the one-use server-side state binds it
// to a previously authenticated administrator request.
VideoRoutes.get('/oauth/callback', catchAsync(async (req, res) => {
  const state = z.string().regex(/^[a-f0-9]{64}$/).parse(req.query.state);
  const adminId = await redis.getdel(`video-oauth:${state}`);
  if (!adminId) throw new AppError('Authorization expired or was already used.', 400);
  if (req.query.error) throw new AppError('Google authorization was declined. Reconnect from settings.', 400);
  const code = z.string().min(1).parse(req.query.code);
  const tokens = await googleTokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.GOOGLE_REDIRECT_URI });
  const channel = await verifyChannel(tokens.access_token);
  if (!tokens.refresh_token) throw new AppError('No offline authorization returned. Revoke the app in Google and reconnect.', 400);
  await videoSettings();
  await db().videoHostingSettings.update({ where: { id: 'central' }, data: {
    encryptedRefreshToken: encryptToken(tokens.refresh_token), channelId: channel.id, channelTitle: channel.snippet.title, lastError: null,
  } });
  clearTokenCache();
  res.redirect(`${config.FRONTEND_URL.replace(/\/$/, '')}/dashboard/admin/settings`);
}));
