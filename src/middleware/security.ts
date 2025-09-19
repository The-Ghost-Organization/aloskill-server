import cors from 'cors';
import type { Request, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';

// Rate limiting configuration
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Too many requests',
    message: 'Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    return req.path === '/health' || req.ip === '127.0.0.1';
  },
});

// Stricter limits for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many login attempts',
    message: 'Please try again in 15 minutes.',
  },
  standardHeaders: true,
});

// Request slowing down (gradual response delay)
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: () => 100,
});

// Advanced CORS configuration
export const corsOptions = {
  origin: process.env.FRONTEND_URL ?? ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  credentials: true,
  maxAge: 600, // 10 minutes
};

// Security headers configuration
export const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' as const },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
};

// Request size limiting middleware
export const requestSizeLimiter: RequestHandler = (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] ?? '0');

  if (contentLength > 5 * 1024 * 1024) {
    // 5MB limit
    return res.status(413).json({
      error: 'Request too large',
      message: 'Request body must be less than 5MB',
    });
  }

  next();
};

// Export all security middlewares
export const securityMiddlewares = [cors(corsOptions), helmet(helmetOptions), requestSizeLimiter];
