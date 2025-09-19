import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import {
  authLimiter,
  generalLimiter,
  securityMiddlewares,
  speedLimiter,
} from './middleware/security.js';
import { sanitizeInput } from './middleware/validation.js';
import { authRoutes } from './modules/auth/routes.js';
import { logger } from './utils/logger.js';

const app = express();

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  logger.info('Health checking.....');
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(securityMiddlewares);
app.use(sanitizeInput);

// Rate limiting (apply to specific routes)
app.use('/api/v1/', generalLimiter);
app.use('/api/v1/', speedLimiter);
app.use('/api/v1/auth/', authLimiter);

// All routes
app.use('/api/v1/auth', authRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
