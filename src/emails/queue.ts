import { randomUUID } from 'node:crypto';

import { Queue } from 'bullmq';
import type { EmailOptions } from '../types/mail.js';
import redisConnection from './redisConnection.js';

type EmailJobData = EmailOptions & { idempotencyKey: string };

export const EMAIL_QUEUE_NAME = 'emailQueue';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 5_000 },
  },
});

export async function addEmailToQueue(email: EmailOptions): Promise<string> {
  const idempotencyKey = randomUUID();
  const job = await emailQueue.add(
    'sendEmail',
    { ...email, idempotencyKey },
    { jobId: idempotencyKey }
  );

  console.info('[email] queued', { jobId: job.id });
  return idempotencyKey;
}
