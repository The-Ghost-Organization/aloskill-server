import { config } from '@/config/env.js';
import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { AppError } from '../utils/appError.js';
import ResponseHandler from '../utils/response.js';

const { JsonWebTokenError, TokenExpiredError } = jwt;

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Log error for monitoring
  console.error('Error:', {
    message: err instanceof AppError && err.message,
    stack: err instanceof AppError && err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // Handle known error types
  if (err instanceof ZodError) {
    return ResponseHandler.unprocessableEntity(res, 'Validation failed', {
      errors: err.issues,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return ResponseHandler.badRequest(res, 'Database operation failed');
  }

  if (err instanceof JsonWebTokenError) {
    return ResponseHandler.unauthorized(res, 'Invalid token');
  }

  if (err instanceof TokenExpiredError) {
    return ResponseHandler.unauthorized(res, 'Token expired');
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // Unknown error (mask in production)
  const message =
    config.NODE_ENV === 'production'
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : String(err);

  return ResponseHandler.internalError(res, message);
};

// 404 handler
export const notFoundHandler: RequestHandler = (req, res, next) => {
  console.log("not found triggered");
  next();
};
