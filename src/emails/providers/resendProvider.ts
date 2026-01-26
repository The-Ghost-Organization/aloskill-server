/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Resend } from 'resend';
import { config } from '../../config/env.js';
import type { EmailOptions, IMailProvider } from '../../types/mail.js';

const resendClient = new Resend(config.RESEND_API_KEY);

export class ResendProvider implements IMailProvider {
  async sendEmail({ to, subject, html, from }: EmailOptions) {
    await resendClient.emails.send({
      from: from ?? 'sandbox@resend.dev',
      to,
      subject,
      html,
    });
  }
}
