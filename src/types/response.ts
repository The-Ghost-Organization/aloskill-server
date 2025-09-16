// // Standardized error response
// export interface ErrorResponse {
//   success: false;
//   message: string;
//   error?: string;
//   details?: unknown;
//   timestamp: string;
// }

// // Pagination metadata
// export interface PaginationMeta {
//   page: number;
//   limit: number;
//   total: number;
//   totalPages: number;
//   hasNext: boolean;
//   hasPrev: boolean;
// }

// // Standardized success response
// export interface SuccessResponse<T = unknown> {
//   success: true;
//   message: string;
//   data?: T;
//   meta?: PaginationMeta;
//   timestamp: string;
// }

// // Union type for all responses
// export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  timestamp: string;
}

export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}
