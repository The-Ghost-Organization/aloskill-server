/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import type { EmailOptions } from '../types/mail.js';
import { addEmailToQueue } from './queue.js';
import { EmailRateLimiter } from './rateLimiter.js';

export type EmailTemplate<Props> = (props: Props) => string;

export const MailService = {
  sendEmail: async <Props>(
    to: string,
    subject: string,
    template: EmailTemplate<Props>,
    templateProps: Props,
    from?: string
  ) => {
    const emailOptions: EmailOptions = {
      to,
      subject,
      html: template(templateProps),
      from,
    };
    // ✅ Enforce rate limit
    const check = await EmailRateLimiter.canSend(to);
    if (!check.allowed) {
      throw new Error(`Rate limit exceeded: ${check.reason}`);
    }
    // Push to Redis queue for asynchronous processing
    await addEmailToQueue(emailOptions);
    // ✅ Record send in Redis
    await EmailRateLimiter.recordSend(to);
  },
};
