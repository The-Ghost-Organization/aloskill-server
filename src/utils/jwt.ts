import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import type { JwtPayload, TokenOptions, TokenPair, TokenType } from '@/types/jwt.js';
import {
  JwtError,
  JwtExpiredError,
  JwtInvalidError,
  JwtMissingError,
} from '@/middleware/errorHandler.js';

class JwtService {
  private static readonly SECRETS: Record<TokenType, string | undefined> = {
    ACCESS: config.JWT_SECRET,
    REFRESH: config.REFRESH_SECRET,
  };

  /**
   * Generate JWT token
   */
  static generateToken(
    payload: Omit<JwtPayload, 'iat' | 'exp' | 'type'>,
    options: TokenOptions
  ): string {
    const { expiresIn, type } = options;

    const secret = this.SECRETS[type];
    if (!secret) {
      throw new Error(`Secret not configured for token type: ${type}`);
    }

    return jwt.sign({ ...payload, type }, secret, { expiresIn } as jwt.SignOptions);
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string, expectedType: TokenType): JwtPayload {
    if (!token || typeof token !== 'string') {
      throw new JwtMissingError('Token is required');
    }

    try {
      const secret = this.SECRETS[expectedType];
      if (!secret) {
        throw new Error(`Secret not configured for token type: ${expectedType}`);
      }

      const decoded = jwt.verify(token, secret) as JwtPayload;

      if (decoded.type !== expectedType) {
        throw new JwtInvalidError(`Invalid token type. Expected: ${expectedType}`);
      }

      return decoded;
    } catch (error: unknown) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new JwtExpiredError();
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new JwtInvalidError('Invalid token signature');
      }
      if (error instanceof JwtError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new JwtInvalidError(error.message);
      }
      throw new JwtInvalidError('Failed to verify token');
    }
  }

  /**
   * Generate access and refresh token pair
   */
  static generateTokenPair(user: { id: string; email: string; role: string }): TokenPair {
    const accessToken = this.generateToken(
      { userId: user.id, email: user.email, role: user.role },
      { expiresIn: config.ACCESS_TOKEN_EXPIRY, type: 'ACCESS' }
    );

    const refreshToken = this.generateToken(
      { userId: user.id, email: user.email, role: user.role },
      { expiresIn: config.REFRESH_TOKEN_EXPIRY, type: 'REFRESH' }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Decode token without verification (for inspection only)
   */
  static decodeToken(token: string): JwtPayload | null {
    if (!token || typeof token !== 'string') {
      return null;
    }

    try {
      return jwt.decode(token) as JwtPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired without verification
   */
  static isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded?.exp) {
      return true;
    }

    return Date.now() >= decoded.exp * 1000;
  }

  /**
   * Get time remaining until token expiration in seconds
   */
  static getTokenExpiryTime(token: string): number | null {
    const decoded = this.decodeToken(token);
    if (!decoded?.exp) {
      return null;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return Math.max(0, decoded.exp - currentTime);
  }

  /**
   * Validate token structure (syntax only, not signature)
   */
  static isValidTokenFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // Basic JWT format validation (3 parts separated by dots)
    const parts = token.split('.');
    return parts.length === 3;
  }
}

export default JwtService;
