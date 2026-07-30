/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import crypto from 'crypto';
import redisConnection from '../emails/redisConnection.js';

export async function createCheckoutSession(items: { books: [], courses: [] }, quantities:{ courses: { courseId: string; quantity: number }[]; books: { bookId: string; quantity: number }[]; }, subtotal: number) {
  const sessionId = `sess_${crypto.randomUUID()}`;

  const payload = {
    items,
    quantities,
    subtotal
  };

  // This keeps your 30MB instance clean automatically!
  await redisConnection.set(`checkout:${sessionId}`, JSON.stringify(payload), 'EX', 900);

  return sessionId;
}

export async function getCheckoutSession(sessionId: string) {
  const data = await redisConnection.get(`checkout:${sessionId}`);
  if (!data) {return null;}
  return JSON.parse(data);
}
