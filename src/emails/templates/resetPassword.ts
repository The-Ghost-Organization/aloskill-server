/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

interface ResetPasswordProps {
  name: string;
  resetLink: string;
}

const resetPasswordTemplate = ({ name, resetLink }: ResetPasswordProps) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
      body { font-family: Arial, sans-serif; background-color: #f9f9f9; color: #333; margin:0; padding:0;}
      .container { max-width: 600px; margin: 20px auto; padding: 20px; background-color: #fff; border-radius: 8px;}
      a { color: #1a73e8; text-decoration: none; }
      .button { display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: #fff; border-radius: 5px; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Hello, ${name}</h2>
      <p>We received a request to reset your password. Click the button below to proceed:</p>
      <p><a class="button" href="${resetLink}">Reset Password</a></p>
      <p>If you did not request a password reset, please ignore this email.</p>
    </div>
  </body>
  </html>
  `;
};

export default resetPasswordTemplate;
