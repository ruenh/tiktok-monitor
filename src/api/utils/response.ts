/**
 * API Response Helpers
 * Provides consistent response formatting for all API endpoints
 */

export enum ErrorCode {
  INVALID_USERNAME = "INVALID_USERNAME",
  INVALID_URL = "INVALID_URL",
  INVALID_INTERVAL = "INVALID_INTERVAL",
  AUTHOR_NOT_FOUND = "AUTHOR_NOT_FOUND",
  AUTHOR_EXISTS = "AUTHOR_EXISTS",
  NOT_FOUND = "NOT_FOUND",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Creates a success response with the provided data
 */
export function successResponse<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Creates an error response with code and message
 */
export function errorResponse(
  code: ErrorCode | string,
  message: string
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
    },
  };
}
