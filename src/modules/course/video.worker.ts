// Run as a separate process using the same TypeScript runner as emails/worker.ts.
import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { connectDatabase, getDatabaseClient as db } from '../../config/database.js';
import { config } from '../../config/env.js';
import redis, { createRedisConnection } from '../../emails/redisConnection.js';
import { deleteStagedFile, stagingPath } from './video.service.js';
import { checked, durationSeconds, inspectVideo, syncPlaylist, transfer, youtube } from './video.youtube.js';

const connection = createRedisConnection('worker');
const queue = new Queue<{ id: string; kind: 'upload' | 'playlist' | 'cleanup' }>('videoHosting', {
  connection: redis, defaultJobOptions: { attempts: 8, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true, removeOnFail: { count: 1000 } },
});

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
  if (job.provider === 'YOUTUBE') {
    const video = await inspectVideo(job.externalVideoId);
    providerStatus = video.processingDetails?.processingStatus ?? video.status.uploadStatus;
    if (['failed', 'rejected', 'deleted'].includes(video.status.uploadStatus) || ['failed', 'terminated'].includes(providerStatus)) throw new Error('Video processing failed. Review the source file and administrator provider diagnostics.');
    ready = video.status.uploadStatus === 'processed' && video.status.privacyStatus === 'unlisted' && video.status.embeddable && providerStatus === 'succeeded';
    if (video.status.uploadStatus === 'processed' && !ready) throw new Error('Processing finished but Unlisted embedding is unavailable. Check channel and API project restrictions.');
    duration = durationSeconds(video.contentDetails?.duration);
  } else {
    const response = await checked(await fetch(`https://video.bunnycdn.com/library/${config.BUNNY_STREAM_LIBRARY_ID}/videos/${job.externalVideoId}`, {
      headers: { AccessKey: config.BUNNY_STREAM_API_KEY }, signal: AbortSignal.timeout(30_000),
    }));
    const video = await response.json() as { status: number; length: number; availableResolutions?: string };
    providerStatus = String(video.status);
    if ([5, 6].includes(video.status)) throw new Error('Premium Hosting processing failed. Retry or upload a supported source.');
    ready = video.status === 4 && Boolean(video.availableResolutions);
    duration = Math.round(video.length);
  }
  await db().videoUploadJob.update({ where: { id }, data: {
    status: ready ? 'READY' : 'PROCESSING', providerStatus, duration,
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
const worker = new Worker<{ id: string; kind: 'upload' | 'playlist' | 'cleanup' }>('videoHosting', async task => {
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
      const jobId = `upload-${job.id}`;
      const previous = await queue.getJob(jobId);
      // Explicit retry is represented by the DB status; failed queue entries are
      // removed before redispatch. Ready/failed records are excluded above.
      if (previous && await previous.getState() === 'failed') await previous.remove();
      await queue.add('upload', { id: job.id, kind: 'upload' }, { jobId });
    }
    const courses = await db().course.findMany({ where: { deletedAt: null, OR: [
      { youtubePlaylistId: { not: null } }, { modules: { some: { lessons: { some: { videoProvider: 'YOUTUBE' } } } } },
    ] }, select: { id: true, updatedAt: true, playlistSyncedAt: true, playlistSyncError: true } });
    for (const course of courses) {
      if (!course.playlistSyncError && course.playlistSyncedAt && course.playlistSyncedAt >= course.updatedAt) continue;
      await queue.add('playlist', { id: course.id, kind: 'playlist' }, { jobId: `playlist-${course.id}-${Math.floor(Date.now() / 300_000)}` });
    }
    const abandoned = await db().videoUploadJob.findMany({ where: { OR: [
      { status: 'CANCELLED' }, { status: { in: ['STAGING', 'READY', 'FAILED'] }, updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
    ] }, take: 100, orderBy: { updatedAt: 'asc' } });
    for (const job of abandoned) await queue.add('cleanup', { id: job.id, kind: 'cleanup' }, { jobId: `cleanup-${job.id}-${Math.floor(Date.now() / 3_600_000)}` });
  } catch { console.error('[video] Dispatch failed; the durable outbox will be retried.'); }
  finally { dispatching = false; }
}
await dispatch();
const timer = setInterval(() => void dispatch(), 30_000);
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  await worker.close();
  await queue.close();
  await connection.quit();
  await redis.quit();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
