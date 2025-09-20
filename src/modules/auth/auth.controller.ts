/* eslint-disable @typescript-eslint/no-unused-vars */
import type { JwtPayload } from '@/types/jwt.js';
import { asyncHandler } from '@/utils/asyncHandler.js';
import CookieService from '@/utils/cookies.js';
import { authService } from './auth.service.js';

const loginUser = asyncHandler(async (req, res): Promise<void> => {
  const result = await authService.loginUser(req.body as { email: string; password: string });
  res.json({ message: 'Login successful', result });
});

const registerUser = asyncHandler(async (req, res): Promise<void> => {
  const { email, role, ...payload } = req.body;
  const result = await authService.registerUser({ email,role });
  CookieService.setAuthCookies(res, result.accessToken, result.refreshToken);
  res.json({ message: 'Register successful', result });
});

export const authController = {
  loginUser,
  registerUser,
};
