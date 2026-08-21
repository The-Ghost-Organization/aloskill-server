import { Resend } from 'resend';

import { config } from '../../config/env.js';
import type { EmailJobData, IMailProvider, MailProviderResult } from '../../types/mail.js';

const resendClient = new Resend(config.RESEND_API_KEY);

export class ResendProvider implements IMailProvider {
  async sendEmail({
    to,
    subject,
    html,
    from,
    idempotencyKey,
  }: EmailJobData): Promise<MailProviderResult> {
    const { data, error } = await resendClient.emails.send(
      {
        from: from ?? config.RESEND_FROM_EMAIL,
        to: [to],
        subject,
        html,
      },
      {
        idempotencyKey,
      }
    );

    if (error) {
      throw new Error(`Resend rejected email: ${error.name} - ${error.message}`);
    }

    if (!data.id) {
      throw new Error('Resend returned no email ID');
    }

    return {
      id: data.id,
    };
  }
}
