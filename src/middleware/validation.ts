import type { NextFunction, Request, RequestHandler, Response } from 'express';
import xss from 'xss';
import { ZodError, type ZodObject } from 'zod';

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
        return res.status(400).json({
          error: 'Validation failed',
          details: '',
        });
      }
      next(error);
    }
  };
};

// XSS sanitization middleware
type Primitive = string | number | boolean | null | undefined;

type InputData = Primitive | InputData[] | { [key: string]: InputData };

export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  const sanitize = <T extends InputData>(obj: T): T => {
    if (typeof obj === 'string') {
      return xss(obj) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitize) as T;
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitized: Record<string, InputData> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized as T;
    }

    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body as InputData);
  }
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
};
