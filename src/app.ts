import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { generalLimiter, securityMiddlewares, speedLimiter } from './middleware/security.js';
import { sanitizeInput } from './middleware/validation.js';
import router from './routes/index.js';
import { logger } from './utils/logger.js';

const app = express();

// Health check endpoint
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
app.use(cookieParser());

// Security middleware
app.use(securityMiddlewares);
app.use(sanitizeInput);

// Rate limiting
app.use('/api/v1/', generalLimiter);
app.use('/api/v1/', speedLimiter);

// All routes
app.use('/api/v1', router);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
