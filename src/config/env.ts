import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SECURE: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  DATABASE_URL: z.url({ message: 'Invalid HTTP(S) URL' }).default('http://localhost:5000'),
  FRONTEND_URL: z
    .url({
      message: 'Invalid HTTP(S) URL',
      protocol: /^https?$/i,
      hostname: /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    })
    .default('http://localhost:3000'),
  COOKIE_SECRET: z.string().min(32, 'Cookie secret must be at least 32 characters'),
  REFRESH_SECRET: z.string().min(32, 'Cookie secret must be at least 32 characters'),
  ACCESS_TOKEN_EXPIRY: z
    .string()
    .min(2, 'Access Token must be at least 2 characters')
    .max(5, 'Access Token must be less than 5 characters')
    .default('24h'),
  REFRESH_TOKEN_EXPIRY: z
    .string()
    .min(2, 'Refresh Token must be at least 2 characters')
    .max(5, 'Refresh Token must be less than 5 characters')
    .default('15m'),
  BCRYPT_ROUND: z.number().default(12),
  MAX_LOGIN_ATTEMP: z.number().default(5),
  LOCKOUT_DURATION: z
    .number('Lockout duration is required')
    .int('Lockout duration must be an integer')
    .min(1000, 'Lockout duration must be at least 1 second')
    .max(24 * 60 * 60 * 1000, 'Lockout duration cannot exceed 1 day')
    .default(15 * 60 * 1000),
});

export const config = envSchema.parse(process.env);

export type Config = z.infer<typeof envSchema>;
