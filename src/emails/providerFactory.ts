import type { IMailProvider } from '../types/mail.js';
import { ResendProvider } from './providers/resendProvider.js';

let provider: IMailProvider | undefined;

export function getMailProvider(): IMailProvider {
  if (provider) {
    return provider;
  }

  const providerName = (process.env.MAIL_PROVIDER ?? 'RESEND').toUpperCase();
  if (providerName !== 'RESEND') {
    throw new Error(`Unsupported MAIL_PROVIDER: ${providerName}`);
  }

  provider = new ResendProvider() as unknown as IMailProvider;
  return provider;
}
