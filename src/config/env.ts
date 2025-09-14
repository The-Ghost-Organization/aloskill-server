import dotenv from 'dotenv';

dotenv.config();

export const config = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '5000'),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRE: process.env.JWT_EXPIRE ?? '7d',
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12'),
};

// Validate required environment variables
// const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
// requiredEnvVars.forEach(envVar => {
//   if (process.env[envVar]) {
//     throw new Error(`Missing required environment variable: ${envVar}`);
//   }
// });
