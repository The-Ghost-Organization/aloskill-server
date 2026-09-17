export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface EmailJobData extends EmailOptions {
  idempotencyKey: string;
}

export interface MailProviderResult {
  id: string;
}

export interface IMailProvider {
  sendEmail(email: EmailJobData): Promise<MailProviderResult>;
}
