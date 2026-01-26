/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
interface SignupWelcomeProps {
  name: string;
  verificationLink: string;
}

const signupWelcomeTemplate = ({ name, verificationLink }: SignupWelcomeProps) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Aloskill</title>
    <style>
      body { font-family: Arial, sans-serif; background-color: #f9f9f9; color: #333; margin:0; padding:0;}
      .container { max-width: 600px; margin: 20px auto; padding: 20px; background-color: #fff; border-radius: 8px;}
      a { color: #1a73e8; text-decoration: none; }
      .button { display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: #fff; border-radius: 5px; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Welcome, ${name}!</h2>
      <p>Thank you for signing up on Aloskill. Please verify your email to get started.</p>
      <p><a class="button" href="${verificationLink}">Verify Email</a></p>
      <p>If you did not sign up, please ignore this email.</p>
    </div>
  </body>
  </html>
  `;
};
export default signupWelcomeTemplate;
