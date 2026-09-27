import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { getMailProvider } from '../../emails/providerFactory.js';

type ContactPayload = {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
  website?: string;
};

const CONTACT_INBOX_EMAIL = (process.env.CONTACT_INBOX_EMAIL ?? 'info@aloskill.com')
  .trim()
  .toLowerCase();

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const buildContactEmail = (payload: ContactPayload) => {
  const fullName = `${payload.firstName.trim()} ${payload.lastName.trim()}`;
  const messageHtml = escapeHtml(payload.message.trim()).replaceAll('\n', '<br />');

  return `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a">
      <div style="background:#DA7C36;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <h2 style="margin:0;font-size:20px">New AloSkill contact request</h2>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        <p style="margin:0 0 10px"><strong>Name:</strong> ${escapeHtml(fullName)}</p>
        <p style="margin:0 0 10px"><strong>Email:</strong> ${escapeHtml(payload.email.trim())}</p>
        <p style="margin:0 0 18px"><strong>Subject:</strong> ${escapeHtml(payload.subject.trim())}</p>
        <div style="border-top:1px solid #e2e8f0;padding-top:18px">
          <p style="margin:0 0 8px"><strong>Message</strong></p>
          <div style="line-height:1.65;color:#334155">${messageHtml}</div>
        </div>
      </div>
    </div>
  `;
};

const submit = async (req: Request) => {
  const payload = req.body as ContactPayload;

  // Honeypot: return the same accepted response but do not queue spam.
  if (payload.website?.trim()) {
    return { reference: randomUUID() };
  }

  const firstName = payload.firstName.trim();
  const lastName = payload.lastName.trim();
  const email = payload.email.trim().toLowerCase();
  const subject = payload.subject.trim();
  const message = payload.message.trim();

  const reference = randomUUID();
  const provider = getMailProvider();

  await provider.sendEmail({
    to: CONTACT_INBOX_EMAIL,
    subject: `[AloSkill Contact] ${subject}`,
    html: buildContactEmail({
      firstName,
      lastName,
      email,
      subject,
      message,
    }),
    replyTo: email,
    idempotencyKey: reference,
  });

  return { reference };
};

export const contactService = { submit };
