/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Queue } from 'bullmq';
import type { EmailOptions } from '../types/mail.js';
import redisConnection from './redisConnection.js';

export const emailQueue = new Queue<EmailOptions>('emailQueue', { connection: redisConnection });

export const addEmailToQueue = async (email: EmailOptions) => {
  console.log('email added to the queue', email);
  await emailQueue.add('sendEmail', email);
};
