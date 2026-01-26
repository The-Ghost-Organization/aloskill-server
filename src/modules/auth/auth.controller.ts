/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import resetPasswordTemplate from '../../emails/templates/resetPassword.js';
import signupWelcomeTemplate from '../../emails/templates/signupWelcome.js';
import catchAsync from '../../utils/asyncHandler.js';
import JwtService from '../../utils/jwt.js';
import ResponseHandler from '../../utils/response.js';
import { type Request, type Response } from 'express';
import { MailService } from '../../emails/mailService.js';
import { authService } from './auth.service.js';

const loginUser = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.loginUser(req);

  if (!result) {
    throw new Error('Login failed');
  }
  const { user, refreshToken } = result as {
    user: {
      email: string;
      role: string[];
      id: string;
      displayName: string;
      profilePicture: string;
    };
    refreshToken: string;
  };

  const accessToken = JwtService.generateToken(
    { email: user.email, role: user.role },
    { expiresIn: '15m', type: 'ACCESS' }
  );

  ResponseHandler.ok(res, 'Login Successful', {
    ...user,
    accessToken,
    refreshToken,
  });
});

const registerStudent = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.registerStudent(req);

  if (!result) {
    throw new Error('Registration failed');
  }
  const { user, refreshToken } = result as {
    user: {
      email: string;
      role: string[];
      id: string;
      displayName: string;
      profilePicture: string;
      emailVerificationToken: string;
    };
    refreshToken: string;
  };

  const accessToken = JwtService.generateToken(
    { email: user.email, role: user.role },
    { expiresIn: '15m', type: 'ACCESS' }
  );

  const { emailVerificationToken, ...separateUser } = user;

  if (user.email && emailVerificationToken) {
    await MailService.sendEmail(user.email, 'Welcome to Aloskill!', signupWelcomeTemplate, {
      name: user.displayName,
      verificationLink: `${process.env.FRONTEND_URL}/auth/verify-user?id=${user?.id}&token=${emailVerificationToken}`,
    });
  }

  ResponseHandler.ok(res, 'Register Successful', {
    ...separateUser,
    accessToken,
    refreshToken,
  });
});

const registerInstructor = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.registerInstructor(req);

  if (!result) {
    throw new Error('InstructorRegistration failed');
  }

  const { emailVerificationToken, passwordResetToken: _passwordResetToken, ...restData } = result;

  if (emailVerificationToken) {
    await MailService.sendEmail(result.email, 'Welcome to Aloskill!', signupWelcomeTemplate, {
      name: result.displayName ?? 'AloSkill User',
      verificationLink: `${process.env.FRONTEND_URL}/auth/verify-user?id=${result.id}&token=${emailVerificationToken}`,
    });
  }

  ResponseHandler.ok(res, 'Register Successful', {
    ...restData,
    redirectToVerificationPage: emailVerificationToken ? true : false,
  });
});

const verifyUser = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.verifyUser(req);

  if (!result) {
    throw new Error('Verification failed');
  }

  ResponseHandler.ok(res, 'User Verified Successfully', result);
});

const resendVerificationEmail = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.resendVerificationEmail(req);

  if (!result) {
    throw new Error('Failed to resend verification email');
  }

  const { email, displayName, emailVerificationToken, id } = result as {
    email: string;
    displayName: string;
    emailVerificationToken: string;
    id: string;
  };

  // Send new verification email
  await MailService.sendEmail(email, 'Verify your email address', signupWelcomeTemplate, {
    name: displayName,
    verificationLink: `${process.env.FRONTEND_URL}/auth/verify-user?id=${id}&token=${emailVerificationToken}`,
  });

  ResponseHandler.ok(res, 'Verification email sent successfully', {
    email,
  });
});

const forgotPassword = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.forgotPassword(req);

  if (!result) {
    throw new Error('Forgot Password failed');
  }

  if (result) {
    const { email, displayName, passwordResetToken, id } = result as {
      email: string;
      displayName: string;
      passwordResetToken: string;
      id: string;
    };

    await MailService.sendEmail(email, 'click here to reset your password', resetPasswordTemplate, {
      name: displayName,
      resetLink: `${process.env.FRONTEND_URL}/auth/reset-password?id=${id}&token=${passwordResetToken}`,
    });
  }
  ResponseHandler.ok(res, 'Check your email for password reset link', {
    email: result.email,
  });
});

const resetPassword = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.resetPassword(req);

  if (!result) {
    throw new Error('Reset Password failed');
  }

  ResponseHandler.ok(res, 'Password Reseted Successfully', {
    email: result.email,
  });
});

// === Logout current device ===
const logoutCurrentDevice = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const result = await authService.logoutCurrentDevice(req); // Call the service to handle the logic

  if (!result) {
    throw new Error('Logout failed');
  }
  ResponseHandler.ok(res, 'Logged out of this device', result);
});

// === Logout all devices ===
const logoutAllDevices = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.logoutAllDevices(req);
  if (!result) {
    throw new Error('Logout failed');
  }

  ResponseHandler.ok(res, 'Logged out from all devices', result);
});

// === Refresh access token controller ===
const refreshAccessToken = catchAsync(async (req, res): Promise<void> => {
  const result = await authService.refreshAccessToken(req);

  if (!result) {
    throw new Error('Refresh token failed');
  }

  const { user, refreshToken } = result as {
    user: {
      email: string;
      role: string[];
      id: string;
      displayName: string;
      profilePicture: string;
    };
    refreshToken: string;
  };
  const accessToken = JwtService.generateToken(
    { email: user.email, role: user.role },
    { expiresIn: '150m', type: 'ACCESS' }
  );

  ResponseHandler.ok(res, 'Token refreshed', {
    ...user,
    accessToken,
    refreshToken,
  });
});

export const authController = {
  loginUser,
  registerStudent,
  registerInstructor,
  verifyUser,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  logoutCurrentDevice,
  logoutAllDevices,
  refreshAccessToken,
};
