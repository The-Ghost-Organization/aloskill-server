export const config = {
  port: process.env.PORT ?? 8000,
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // JWT Configuration
  jwtSecret: process.env.JWT_SECRET,
  refreshSecret: process.env.REFRESH_SECRET,
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',

  // Database
  databaseUrl: process.env.DATABASE_URL,
  //   redisUrl: process.env.REDIS_URL!,

  // Frontend
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',

  // Security
  bcryptRounds: 12,
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes

  // Cookies
  cookieSecret: process.env.COOKIE_SECRET,
  secure: process.env.NODE_ENV === 'production',
};
