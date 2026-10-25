// Run as a separate process using the same TypeScript runner as emails/worker.ts.
import 'dotenv/config';
import { Worker } from 'bullmq';
import { connectDatabase, getDatabaseClient as db } from '../../config/database.js';
import { config } from '../../config/env.js';
import redis, { createRedisConnection } from '../../emails/redisConnection.js';
import { deleteStagedFile, stagingPath } from './video.service.js';
import { VIDEO_HEARTBEAT_KEY, enqueueVideoUpload, videoQueue, type VideoTask } from './video.queue.js';
import { checked, durationSeconds, inspectVideo, syncPlaylist, transfer, youtube } from './video.youtube.js';

const connection = createRedisConnection('worker');
const queue = videoQueue;

async function processUpload(id: string): Promise<void> {
  let job = await db().videoUploadJob.findUnique({ where: { id } });
  if (!job || !['QUEUED', 'UPLOADING', 'PROCESSING'].includes(job.status)) return;
  if (Date.now() - job.createdAt.getTime() > 48 * 3_600_000) throw new Error('Upload or processing exceeded 48 hours. Administrator review is required.');
  if (job.provider === 'YOUTUBE' && !job.externalVideoId) {
    await transfer(job, stagingPath(id));
    job = await db().videoUploadJob.findUniqueOrThrow({ where: { id } });
  }
  if (!job.externalVideoId) throw new Error('Provider asset identifier is missing.');
  let ready = false;
  let duration = 0;
  let providerStatus = '';
  let processingProgress: number | null = null;
  if (job.provider === 'YOUTUBE') {
    const video = await inspectVideo(job.externalVideoId);
    providerStatus = video.processingDetails?.processingStatus ?? video.status.uploadStatus;
    if (['failed', 'rejected', 'deleted'].includes(video.status.uploadStatus) || providerStatus === 'failed') throw new Error('Video processing failed. Review the source file and administrator provider diagnostics.');
    ready = video.status.uploadStatus === 'processed' && video.status.privacyStatus === 'unlisted' && video.status.embeddable && providerStatus !== 'processing';
    if (video.status.uploadStatus === 'processed' && !ready) throw new Error('Processing finished but Unlisted embedding is unavailable. Check channel and API project restrictions.');
    const progress = video.processingDetails?.processingProgress;
    if (Number(progress?.partsTotal) > 0) processingProgress = Math.max(0, Math.min(100, Math.floor(Number(progress?.partsProcessed ?? 0) / Number(progress?.partsTotal) * 100)));
    duration = durationSeconds(video.contentDetails?.duration);
  } else {
    const response = await checked(await fetch(`https://video.bunnycdn.com/library/${config.BUNNY_STREAM_LIBRARY_ID}/videos/${job.externalVideoId}`, {
      headers: { AccessKey: config.BUNNY_STREAM_API_KEY }, signal: AbortSignal.timeout(30_000),
    }));
    const video = await response.json() as { status: number; length: number; availableResolutions?: string; encodeProgress?: number };
    providerStatus = String(video.status);
    if ([5, 6].includes(video.status)) throw new Error('Premium Hosting processing failed. Retry or upload a supported source.');
    ready = video.status === 4 && Boolean(video.availableResolutions);
    processingProgress = Number.isFinite(video.encodeProgress) ? Math.min(100, Math.max(0, Math.floor(video.encodeProgress!))) : null;
    duration = Math.round(video.length);
  }
  await db().videoUploadJob.update({ where: { id }, data: {
    status: ready ? 'READY' : 'PROCESSING', providerStatus, duration, processingProgress: ready ? 100 : processingProgress,
    uploadError: null, lastSyncedAt: new Date(),
  } });
  if (ready) await deleteStagedFile(id);
}

async function cleanup(id: string): Promise<void> {
  await db().$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset:${id}`}))`;
  const job = await tx.videoUploadJob.findUnique({ where: { id } });
  if (!job || job.status === 'RETIRED') return;
  if (await tx.lesson.count({ where: { videoUploadJobId: id, deletedAt: null } })) {
    await tx.videoUploadJob.update({ where: { id }, data: { updatedAt: new Date() } });
    return;
  }
  const age = Date.now() - job.updatedAt.getTime();
  if (job.status !== 'CANCELLED' && age < 7 * 86_400_000) return;
  if (['QUEUED', 'UPLOADING', 'PROCESSING'].includes(job.status)) return;
  if (job.externalVideoId) {
    if (job.provider === 'YOUTUBE') {
      if (job.status === 'CANCELLED') await youtube(`videos?id=${job.externalVideoId}`, 'DELETE');
      else await youtube('videos?part=status', 'PUT', { id: job.externalVideoId, status: { privacyStatus: 'private', embeddable: true } });
    } else {
      const response = await fetch(`https://video.bunnycdn.com/library/${config.BUNNY_STREAM_LIBRARY_ID}/videos/${job.externalVideoId}`, {
        method: 'DELETE', headers: { AccessKey: config.BUNNY_STREAM_API_KEY }, signal: AbortSignal.timeout(30_000),
      });
      if (response.status !== 404) await checked(response);
    }
  }
  await deleteStagedFile(id);
  await tx.videoUploadJob.update({ where: { id }, data: { status: 'RETIRED', sessionUrl: null } });
  }, { timeout: 90_000 });
}

await connectDatabase();
const worker = new Worker<VideoTask>('videoHosting', async task => {
  if (task.data.kind === 'playlist') {
    try { await syncPlaylist(task.data.id); }
    catch (error) {
      await db().course.updateMany({ where: { id: task.data.id }, data: { playlistSyncError: error instanceof Error ? error.message.slice(0, 500) : 'Playlist synchronization failed.' } });
      throw error;
    }
  } else if (task.data.kind === 'cleanup') await cleanup(task.data.id);
  else await processUpload(task.data.id);
}, { connection, concurrency: config.VIDEO_WORKER_CONCURRENCY, lockDuration: 180_000 });

worker.on('failed', (task, error) => {
  if (!task || task.data.kind !== 'upload') return;
  const terminal = task.attemptsMade >= (task.opts.attempts ?? 8);
  void db().videoUploadJob.updateMany({ where: { id: task.data.id, status: { in: ['QUEUED', 'UPLOADING', 'PROCESSING'] } }, data: {
    ...(terminal ? { status: 'FAILED' as const } : {}), uploadError: error.message.slice(0, 500),
  } }).catch(() => console.error('[video] Could not persist upload failure.'));
});
worker.on('error', () => console.error('[video] Queue worker unavailable; check Redis and database connectivity.'));

let dispatching = false;
async function dispatch(): Promise<void> {
  if (dispatching) return;
  dispatching = true;
  try {
    const pending = await db().videoUploadJob.findMany({ where: { status: { in: ['QUEUED', 'UPLOADING', 'PROCESSING'] } }, take: 200, orderBy: { updatedAt: 'asc' } });
    for (const job of pending) {
      await enqueueVideoUpload(job.id);
    }
    const courses = await db().course.findMany({ where: { deletedAt: null, OR: [
      { youtubePlaylistId: { not: null } }, { modules: { some: { lessons: { some: { videoProvider: 'YOUTUBE' } } } } },
    ] }, select: { id: true, updatedAt: true, playlistSyncedAt: true, playlistSyncError: true } });
    for (const course of courses) {
      if (!course.playlistSyncError && course.playlistSyncedAt && course.playlistSyncedAt >= course.updatedAt) continue;
      await queue.add('playlist', { id: course.id, kind: 'playlist' }, { jobId: `playlist-${course.id}-${Math.floor(Date.now() / 300_000)}`, priority: 10 });
    }
    const abandoned = await db().videoUploadJob.findMany({ where: { OR: [
      { status: 'CANCELLED' }, { status: { in: ['STAGING', 'READY', 'FAILED'] }, updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
    ] }, take: 100, orderBy: { updatedAt: 'asc' } });
    for (const job of abandoned) await queue.add('cleanup', { id: job.id, kind: 'cleanup' }, { jobId: `cleanup-${job.id}-${Math.floor(Date.now() / 3_600_000)}`, priority: 20 });
  } catch { console.error('[video] Dispatch failed; the durable outbox will be retried.'); }
  finally { dispatching = false; }
}
await worker.waitUntilReady();
const heartbeatValue = String(process.pid);
const heartbeat = async () => {
  if (!worker.isRunning() || worker.isPaused()) return;
  await redis.set(VIDEO_HEARTBEAT_KEY, heartbeatValue, 'EX', 45);
};
await heartbeat();
console.info('[video] Worker ready. Uploads and processing verification are active.');
const heartbeatTimer = setInterval(() => void heartbeat().catch(() => console.error('[video] Heartbeat failed. Check Redis.')), 10_000);
await dispatch();
const timer = setInterval(() => void dispatch(), 10_000);
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  clearInterval(heartbeatTimer);
  await worker.close();
  await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, VIDEO_HEARTBEAT_KEY, heartbeatValue);
  await queue.close();
  await connection.quit();
  await redis.quit();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
