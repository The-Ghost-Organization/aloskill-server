/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable require-await */
/* eslint-disable @typescript-eslint/require-await */
import JwtService from '@/utils/jwt.js';

const loginUser = async (payload: { email: string; password: string }) => {
  const { email, password } = payload;
  console.log('login', email, password);
};

const registerUser = async (payload: { email: string; role: string }) => {
  const jwtToken = JwtService.generateTokenPair(payload);
  return jwtToken;
};

export const authService = {
  loginUser,
  registerUser,
};
