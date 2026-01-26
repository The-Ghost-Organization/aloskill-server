import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default(process.env.PORT as string),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SECURE: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT secret must be at least 32 characters')
    .default(process.env.JWT_SECRET as string),
  DATABASE_URL: z
    .url({ message: 'Invalid HTTP(S) URL' })
    .default(process.env.DATABASE_URL as string),
  FRONTEND_URL: z
    .url({
      message: 'Invalid HTTP(S) URL',
      protocol: /^https?$/i,
      hostname: /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    })
    // .default(process.env.FRONTEND_URL as string),
    .default('http://localhost:3000'),
  COOKIE_SECRET: z
    .string()
    .min(32, 'Cookie secret must be at least 32 characters')
    .default(process.env.COOKIE_SECRET as string),
  REFRESH_SECRET: z
    .string()
    .min(32, 'Cookie secret must be at least 32 characters')
    .default(process.env.REFRESH_SECRET as string),
  REFRESH_MAX_AGE: z.number().default(7 * 24 * 60 * 60 * 1000),
  ACCESS_MAX_AGE: z.number().default(12 * 60 * 60 * 1000),
  ACCESS_TOKEN_EXPIRY: z.string().default('12h'),
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
  BCRYPT_ROUND: z.number().default(12),
  MAX_LOGIN_ATTEMP: z.number().default(5),
  LOCKOUT_DURATION: z
    .number('Lockout duration is required')
    .int('Lockout duration must be an integer')
    .min(1000, 'Lockout duration must be at least 1 second')
    .max(24 * 60 * 60 * 1000, 'Lockout duration cannot exceed 1 day')
    .default(15 * 60 * 1000),
  REDIS_HOST: z.string().default(process.env.REDIS_HOST as string),
  REDIS_PORT: z.string().default(process.env.REDIS_PORT as string),
  REDIS_PASSWORD: z.string().default(process.env.REDIS_PASSWORD as string),
  RESEND_API_KEY: z.string().default(process.env.RESEND_API_KEY as string),
  PHONE_KEY: z.string().default(process.env.PHONE_KEY as string),
  BUNNY_STREAM_API_KEY: z.string().default(process.env.BUNNY_STREAM_API_KEY as string),
  BUNNY_STREAM_TOKEN_AUTH_KEY: z
    .string()
    .default(process.env.BUNNY_STREAM_TOKEN_AUTH_KEY as string),
  BUNNY_STREAM_LIBRARY_ID: z.string().default(process.env.BUNNY_STREAM_LIBRARY_ID as string),
  BUNNY_STORAGE_ZONE_USERNAME: z
    .string()
    .default(process.env.BUNNY_STORAGE_ZONE_USERNAME as string),
  BUNNY_STORAGE_ZONE_PASSWORD: z
    .string()
    .default(process.env.BUNNY_STORAGE_ZONE_PASSWORD as string),
  BUNNY_PULL_ZONE: z.string().default(process.env.BUNNY_PULL_ZONE as string),
  SSLCOMMERCE_STORE_ID: z.string().default(process.env.SSLCOMMERCE_STORE_ID as string),
  SSLCOMMERCE_STORE_PASSWORD: z.string().default(process.env.SSLCOMMERCE_STORE_PASS as string),
});

export const config = envSchema.parse(process.env);

export type Config = z.infer<typeof envSchema>;
