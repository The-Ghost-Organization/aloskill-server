// import { IMailProvider, EmailOptions } from '../../types/mail';
// import AWS from 'aws-sdk';

// const ses = new AWS.SES({ region: 'us-east-1' });

// export class AwsSESProvider implements IMailProvider {
//   async sendEmail({ to, subject, html, from }: EmailOptions) {
//     await ses.sendEmail({
//       Source: from || 'noreply@aloskill.com',
//       Destination: { ToAddresses: [to] },
//       Message: {
//         Subject: { Data: subject },
//         Body: { Html: { Data: html } },
//       },
//     }).promise();
//   }
// }
