import { Worker } from 'bullmq';
import type { EmailJobData } from '../types/mail.js';
import { getMailProvider } from './providerFactory.js';
import redisConnection, { createRedisConnection } from './redisConnection.js';

const EMAIL_QUEUE_NAME = 'emailQueue';

const workerConnection = createRedisConnection('worker');

export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async job => {
    const provider = getMailProvider();
    const result = await provider.sendEmail(job.data);

    console.info('[email] accepted by provider', {
      jobId: job.id,
      providerMessageId: result.id,
    });

    return result;
  },
  {
    connection: workerConnection,
    concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY ?? 5),
  }
);

emailWorker.on('failed', (job, error) => {
  console.error('[email] job failed', {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    message: error.message,
  });
});

emailWorker.on('error', error => {
  console.error('[email] worker error', { message: error.message });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.info('[email] worker shutting down', { signal });
  await emailWorker.close();
  await workerConnection.quit();
  await redisConnection.quit();
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
