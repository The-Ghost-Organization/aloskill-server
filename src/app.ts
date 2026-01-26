import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { generalLimiter, securityMiddlewares, speedLimiter } from './middleware/security.js';
import { sanitizeInput } from './middleware/validation.js';
import router from './routes/index.js';
import { logger } from './utils/logger.js';
import { trackDevice } from './middleware/deviceTracker.js';
// import { trackActivity } from './middleware/activityTracker.js';

// Initialize the Express application
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
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Proxy support
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(securityMiddlewares);
app.use(sanitizeInput);

// Global middleware for tracking device and activity
app.use(trackDevice);
// app.use(trackActivity);

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
