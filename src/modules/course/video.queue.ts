import { Queue } from 'bullmq';
import redis from '../../emails/redisConnection.js';

export const VIDEO_HEARTBEAT_KEY = 'videoHosting:worker:heartbeat';
export type VideoTask = { id: string; kind: 'upload' | 'playlist' | 'cleanup' };
export const videoQueue = new Queue<VideoTask>('videoHosting', {
  connection: redis,
  defaultJobOptions: {
    attempts: 8, backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: true, removeOnFail: { count: 1000 },
  },
});

export async function enqueueVideoUpload(id: string): Promise<void> {
  const jobId = `upload-${id}`;
  const previous = await videoQueue.getJob(jobId);
  if (previous && await previous.getState() === 'failed') await previous.remove();
  await videoQueue.add('upload', { id, kind: 'upload' }, { jobId, priority: 1 });
}

export async function videoWorkerAvailable(): Promise<boolean> {
  try { return await redis.exists(VIDEO_HEARTBEAT_KEY) === 1; }
  catch { return false; }
}
