import type { IMailProvider } from '../types/mail.js';
import { ResendProvider } from './providers/resendProvider.js';
// import { AwsSESProvider } from './providers/awsSESProvider.js';

export const getMailProvider = (): IMailProvider => {
  switch (process.env.MAIL_PROVIDER) {
    // case 'SES':
    //   return new AwsSESProvider();
    case 'RESEND':
      return new ResendProvider();
    default:
      return new ResendProvider();
  }
};
