import { config } from '@/config/env.js';
import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { errorlogger } from '../utils/logger.js';
import ResponseHandler from '../utils/response.js';
import { HttpStatus } from '@/types/shared.js';
import type { SafeZodIssue, ZIssueLike } from '@/types/errorHandler.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

// JWT Error types
export class JwtError extends AppError {
  constructor(
    message: string,
    public readonly code: string,
    statusCode = HttpStatus.UNAUTHORIZED
  ) {
    super(message, statusCode);
    this.name = 'JwtError';
    this.code = code;
  }
}

export class JwtExpiredError extends JwtError {
  constructor(message = 'Token expired') {
    super(message, 'TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED);
  }
}

export class JwtInvalidError extends JwtError {
  constructor(message = 'Invalid token') {
    super(message, 'INVALID_TOKEN', HttpStatus.UNAUTHORIZED);
  }
}

export class JwtMissingError extends JwtError {
  constructor(message = 'Token missing') {
    super(message, 'TOKEN_MISSING', HttpStatus.UNAUTHORIZED);
  }
}

export class InsufficientPermissionsError extends JwtError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'INSUFFICIENT_PERMISSIONS', HttpStatus.FORBIDDEN);
  }
}

const sanitizeZodIssues = (issues: ZIssueLike[]): SafeZodIssue[] => {
  return issues.map(i => ({
    path: i.path.map(p => (typeof p === 'symbol' ? (p.description ?? String(p)) : p)),
    message: i.message,
    code: i.code,
  }));
};

const mapPrismaError = (
  err: Prisma.PrismaClientKnownRequestError
): { status: 400 | 404 | 409; message: string } => {
  switch (err.code) {
    case 'P2002':
      return { status: 409, message: 'Resource already exists' };
    case 'P2003':
      return { status: 400, message: 'Invalid reference to related resource' };
    case 'P2025':
      return { status: 404, message: 'Requested resource not found' };
    default:
      return { status: 400, message: 'Database operation failed' };
  }
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Log error details
  errorlogger.error({
    name: err?.name,
    message: err?.message ?? String(err),
    code: err?.code,
    stack: err?.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString(),
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return ResponseHandler.unprocessableEntity(res, 'Validation failed', {
      errors: sanitizeZodIssues(err.issues),
    });
  }

  // Handle Prisma known client errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    if (mapped.status === 409) {
      return ResponseHandler.conflict(res, mapped.message);
    }
    if (mapped.status === 404) {
      return ResponseHandler.notFound(res, mapped.message);
    }
    return ResponseHandler.badRequest(res, mapped.message);
  }

  // Handle Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    return ResponseHandler.badRequest(res, 'Invalid data provided');
  }

  // Handle other Prisma errors
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return ResponseHandler.internalError(res, 'Database connection failed');
  }

  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return ResponseHandler.internalError(res, 'Database request failed');
  }

  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return ResponseHandler.internalError(res, 'Database engine error');
  }

  // Handle custom JWT errors
  if (err instanceof JwtExpiredError) {
    return ResponseHandler.unauthorized(res, err.message);
  }

  if (err instanceof JwtInvalidError) {
    return ResponseHandler.unauthorized(res, err.message);
  }

  if (err instanceof JwtMissingError) {
    return ResponseHandler.unauthorized(res, err.message);
  }

  if (err instanceof InsufficientPermissionsError) {
    return ResponseHandler.forbidden(res, err.message);
  }

  // Handle other custom JWT errors (base class)
  if (err instanceof JwtError) {
    if (err.statusCode === 403) {
      return ResponseHandler.forbidden(res, err.message);
    }
    return ResponseHandler.unauthorized(res, err.message);
  }

  // Handle specific AppError subclasses
  if (err instanceof NotFoundError) {
    return ResponseHandler.notFound(res, err.message);
  }

  if (err instanceof ValidationError) {
    return ResponseHandler.badRequest(res, err.message);
  }

  if (err instanceof UnauthorizedError) {
    return ResponseHandler.unauthorized(res, err.message);
  }

  if (err instanceof ForbiddenError) {
    return ResponseHandler.forbidden(res, err.message);
  }

  // Handle base AppError class (operational errors)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // Unknown error (mask in production)
  const safeMessage =
    config.NODE_ENV === 'production'
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : String(err);

  return ResponseHandler.internalError(res, safeMessage);
};

export const notFoundHandler: RequestHandler = (_req, res, _next) => {
  return ResponseHandler.notFound(res, 'Resource not found');
};
