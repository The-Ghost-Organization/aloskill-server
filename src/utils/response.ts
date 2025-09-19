import { type ApiResponse, HttpStatus } from '@/types/shared.js';
import type { Response } from 'express';

class ResponseHandler {
  private static send = <T>(
    res: Response,
    statusCode: HttpStatus,
    message: string,
    data?: T,
    meta?: ApiResponse['meta']
  ): Response => {
    const response: ApiResponse<T> = {
      success: statusCode < HttpStatus.BAD_REQUEST,
      message,
      data,
      meta,
      timestamp: new Date().toISOString(),
    };

    // Remove undefined fields
    if (!data) {
      delete response.data;
    }
    if (!meta) {
      delete response.meta;
    }
    return res.status(statusCode).json(response);
  };

  static ok = <T>(res: Response, message = 'Request successful', data?: T): Response => {
    return this.send(res, HttpStatus.OK, message, data);
  };

  static created = <T>(
    res: Response,
    message = 'Resource created successfully',
    data?: T
  ): Response => {
    return this.send(res, HttpStatus.CREATED, message, data);
  };

  static accepted = <T>(res: Response, message = 'Request accepted', data?: T): Response => {
    return this.send(res, HttpStatus.ACCEPTED, message, data);
  };

  static noContent = (res: Response, message = 'No content'): Response => {
    return this.send(res, HttpStatus.NO_CONTENT, message);
  };

  static badRequest = (res: Response, message = 'Bad request'): Response => {
    return this.send(res, HttpStatus.BAD_REQUEST, message);
  };

  static unauthorized = (res: Response, message = 'Unauthorized'): Response => {
    return this.send(res, HttpStatus.UNAUTHORIZED, message);
  };

  static forbidden = (res: Response, message = 'Forbidden'): Response => {
    return this.send(res, HttpStatus.FORBIDDEN, message);
  };

  static notFound = (res: Response, message = 'Resource not found'): Response => {
    return this.send(res, HttpStatus.NOT_FOUND, message);
  };

  static conflict = (res: Response, message = 'Resource conflict'): Response => {
    return this.send(res, HttpStatus.CONFLICT, message);
  };

  static unprocessableEntity = (
    res: Response,
    message = 'Unprocessable entity',
    errors?: Record<string, unknown>
  ): Response => {
    return this.send(res, HttpStatus.UNPROCESSABLE_ENTITY, message, errors);
  };

  static tooManyRequests = (res: Response, message = 'Too many requests'): Response => {
    return this.send(res, HttpStatus.TOO_MANY_REQUESTS, message);
  };

  static internalError = (res: Response, message = 'Internal server error'): Response => {
    return this.send(res, HttpStatus.INTERNAL_SERVER_ERROR, message);
  };

  static serviceUnavailable = (
    res: Response,
    message = 'Service temporarily unavailable'
  ): Response => {
    return this.send(res, HttpStatus.SERVICE_UNAVAILABLE, message);
  };

  static paginated = <T>(
    res: Response,
    data: T[],
    total: number,
    page: number,
    limit: number,
    message = 'Data retrieved successfully'
  ): Response => {
    const totalPages = Math.ceil(total / limit);

    return this.send(res, HttpStatus.OK, message, data, {
      page,
      limit,
      total,
      totalPages,
    });
  };

  static withMeta = <T>(
    res: Response,
    statusCode: HttpStatus,
    message: string,
    data: T,
    meta: ApiResponse['meta']
  ): Response => {
    return this.send(res, statusCode, message, data, meta);
  };
}

// Convenience export
export const {
  ok,
  created,
  accepted,
  noContent,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessableEntity,
  tooManyRequests,
  internalError,
  serviceUnavailable,
  paginated,
  withMeta,
} = ResponseHandler;

export default ResponseHandler;
