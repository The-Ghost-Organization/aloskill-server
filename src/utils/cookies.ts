/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type { CookieOptions, Request, Response } from 'express';
import { config } from '../config/env.js';

// Extended Request interface with cookies
export interface AuthenticatedRequest extends Request {
  cookies: Partial<Record<string, string>>;
}

// Cookie configuration types
export interface CookieConfig {
  access: CookieOptions;
  refresh: CookieOptions;
  logout: CookieOptions;
}

// Default cookie options
export const defaultCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: config.NODE_ENV === 'production' ? 'strict' : 'lax',
  path: '/',
};

// Specific cookie configurations
export const cookieConfig: CookieConfig = {
  access: {
    ...defaultCookieOptions,
    maxAge: config.ACCESS_MAX_AGE,
  },
  refresh: {
    ...defaultCookieOptions,
    maxAge: config.REFRESH_MAX_AGE,
  },
  logout: {
    ...defaultCookieOptions,
    maxAge: 0,
  },
};

class CookieService {
  /**
   * Set cookie with type-safe options
   */
  static setCookie(
    res: Response,
    name: string,
    value: string,
    options: CookieOptions = defaultCookieOptions
  ): void {
    res.cookie(name, value, {
      ...defaultCookieOptions,
      ...options,
    });
  }

  /**
   * Set authentication cookies (access + refresh)
   */
  static setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    this.setCookie(res, 'accessToken', accessToken, cookieConfig.access);
    this.setCookie(res, 'refreshToken', refreshToken, cookieConfig.refresh);
  }

  /**
   * Clear authentication cookies
   */
  static clearAuthCookies(res: Response): void {
    this.setCookie(res, 'accessToken', '', cookieConfig.logout);
    this.setCookie(res, 'refreshToken', '', cookieConfig.logout);
  }

  /**
   * Get cookie from request (type-safe)
   */
  static getCookie(req: AuthenticatedRequest, name: string): string | undefined {
    return req.cookies?.[name];
  }

  /**
   * Get access token from cookies or Authorization header
   */
  static getAccessToken(req: AuthenticatedRequest): string | null {
    // Check cookies first
    const cookieToken = this.getCookie(req, 'accessToken');
    if (cookieToken) {
      return cookieToken;
    }

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Get refresh token from cookies
   */
  static getRefreshToken(req: AuthenticatedRequest): string | null {
    const refreshToken = this.getCookie(req, 'refreshToken');
    return refreshToken ?? null;
  }

  /**
   * Check if request has authentication cookies
   */
  static hasAuthCookies(req: AuthenticatedRequest): boolean {
    return !!this.getCookie(req, 'accessToken') && !!this.getCookie(req, 'refreshToken');
  }

  /**
   * Set cookie with explicit expiration
   */
  static setCookieWithExpiration(
    res: Response,
    name: string,
    value: string,
    maxAge: number, // milliseconds
    options: Omit<CookieOptions, 'maxAge'> = defaultCookieOptions
  ): void {
    this.setCookie(res, name, value, {
      ...options,
      maxAge,
    });
  }

  /**
   * Set secure cookie for sensitive data
   */
  static setSecureCookie(
    res: Response,
    name: string,
    value: string,
    options: Omit<CookieOptions, 'secure' | 'httpOnly'> = {}
  ): void {
    this.setCookie(res, name, value, {
      ...defaultCookieOptions,
      ...options,
      secure: true,
      httpOnly: true,
    });
  }
}

export default CookieService;
