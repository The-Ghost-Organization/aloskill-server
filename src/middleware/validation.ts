import type { NextFunction, Request, RequestHandler, Response } from 'express';
import xss from 'xss';
import { ZodError, type ZodObject } from 'zod';
import { AppError } from './errorHandler.js';

// Zod validation middleware
export const validate = (schema: ZodObject): RequestHandler => {
  return async (req, res, next) => {
    try {
      await schema.parseAsync({
        body: req.body as object,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(error);
      }
      next(error);
    }
  };
};

// XSS sanitization middleware
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    value.constructor === Object
  );
};

// Alternative: More strict version that only sanitizes strings
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const sanitizeStringsInObject = (obj: Record<string, unknown>): void => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          obj[key] = xss(value);
        } else if (isPlainObject(value)) {
          sanitizeStringsInObject(value);
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (typeof item === 'string') {
              value[index] = xss(item);
            } else if (isPlainObject(item)) {
              sanitizeStringsInObject(item);
            }
          });
        }
      }
    };

    // Sanitize only if the property is a plain object
    if (isPlainObject(req.body)) {
      sanitizeStringsInObject(req.body);
    }

    if (isPlainObject(req.query)) {
      sanitizeStringsInObject(req.query);
    }

    if (isPlainObject(req.params)) {
      sanitizeStringsInObject(req.params);
    }

    next();
  } catch (_error) {
    return next(new AppError('Invalid input', 400));
  }
};
