import { Worker } from 'bullmq';
import type { EmailOptions } from '../types/mail.js';
import { getMailProvider } from './providerFactory.js';
import redisConnection from './redisConnection.js';

new Worker<EmailOptions>(
  'emailQueue',
  async job => {
    const provider = getMailProvider();
    await provider.sendEmail(job.data);
    console.log(`Email sent to from worker ${job.data.to}`);
  },
  { connection: redisConnection }
);
