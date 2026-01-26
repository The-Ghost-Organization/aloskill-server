/* eslint-disable @typescript-eslint/prefer-optional-chain */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import JwtService from '../utils/jwt.js';
import ResponseHandler from '../utils/response.js';
import { InsufficientPermissionsError } from './errorHandler.js';

type RoleCheck = (userRole: string[], requiredRoles: string[]) => boolean;

// Role checking
export const roleStrategies: Record<string, RoleCheck> = {
  any: (userRole, requiredRoles) => userRole.some(role => requiredRoles.includes(role)),
  all: (userRole, requiredRoles) => requiredRoles.every(role => userRole.includes(role)),
  exact: (userRole, requiredRoles) => {
    if (userRole.length !== requiredRoles.length) {
      return false;
    }

    return requiredRoles.every(role => userRole.includes(role));
  },
};

// Middleware options
interface AuthOptions {
  roles?: string[];
  strategy?: keyof typeof roleStrategies;
  allowPublic?: boolean;
}

/**
 * Main authentication middleware
 */
export const authenticate = (options: AuthOptions = {}): RequestHandler => {
  const { roles = [], strategy = 'any', allowPublic = false } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ResponseHandler.unauthorized(res, 'Unauthorized: Missing or malformed token');
      }

      const token = authHeader.split(' ')[1];

      if (!token) {
        if (allowPublic) {
          return next();
        }
        return ResponseHandler.unauthorized(res, 'Unauthorized: Missing or malformed token');
      }

      // Verify token
      const decoded = JwtService.verifyToken(token, 'ACCESS');
      (req as any).user = decoded;

      // Role-based authorization
      if (roles.length > 0) {
        const hasPermission = roleStrategies[strategy](decoded.role, roles);

        if (!hasPermission) {
          throw new InsufficientPermissionsError(
            `Required roles: ${roles.join(', ')}. Your role: ${decoded.role.join(',')}`
          );
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const verifyAccessToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  console.log('Authorization header:', authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: Missing or malformed token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    // Verify token using JWT_SECRET
    const decoded = jwt.verify(token, config.JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };
    console.log('Decoded token:', decoded);
    (req as any).user = decoded; // Attach decoded user info to the request
    console.log('User after decoding:', (req as any).user);
    next(); // Proceed to the next handler
  } catch (err) {
    console.error('JWT verification failed:', err);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Convenience middleware for common role patterns
export const requireAuth = authenticate();

export const requireAdmin = authenticate({
  roles: ['admin', 'superadmin'],
  strategy: 'any',
});

export const requireSuperAdmin = authenticate({
  roles: ['superadmin'],
  strategy: 'exact',
});

export const requireInstructor = authenticate({
  roles: ['INSTRUCTOR', 'ADMIN'],
  strategy: 'any',
});

export const requireStudent = authenticate({
  roles: ['STUDENT', 'INSTRUCTOR', 'ADMIN'],
  strategy: 'any',
});

export const optionalAuth = authenticate({ allowPublic: true });
