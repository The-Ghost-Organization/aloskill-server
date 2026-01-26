export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface IMailProvider {
  sendEmail(email: EmailOptions): Promise<void>;
}
