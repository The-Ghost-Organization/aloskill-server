import 'dotenv/config';
import express from 'express';
import { config } from './config/env.js';
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
const port = config.PORT;

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(securityMiddlewares);
app.use(sanitizeInput);

// Rate limiting (apply to specific routes)
app.use('/api/', generalLimiter);
app.use('/api/', speedLimiter);
app.use('/api/auth/', authLimiter);

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  logger.info('Health checking.....');
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// All routes
app.use('/api/auth', authRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📚 Environment: ${config.NODE_ENV}`);
});

export default app;
