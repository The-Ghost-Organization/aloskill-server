/* eslint-disable @typescript-eslint/await-thenable */
import type { EmailOptions } from '../types/mail.js';
import { addEmailToQueue } from './queue.js';
import { EmailRateLimiter } from './rateLimiter.js';

export type EmailTemplate<Props> = (props: Props) => string;

export const MailService = {
  async sendEmail<Props>(
    to: string,
    subject: string,
    template: EmailTemplate<Props>,
    templateProps: Props,
    from?: string
  ): Promise<{ jobId: string }> {
    const recipient = to.trim().toLowerCase();
    if (!recipient || !subject.trim()) {
      throw new Error('Email recipient and subject are required');
    }

    const rateLimit = await EmailRateLimiter.consume(recipient);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded: ${rateLimit.reason}`);
    }

    const emailOptions: EmailOptions = {
      to: recipient,
      subject: subject.trim(),
      html: template(templateProps),
      ...(from ? { from } : {}),
    };

    const jobId = await addEmailToQueue(emailOptions);
    return { jobId };
  },
};
