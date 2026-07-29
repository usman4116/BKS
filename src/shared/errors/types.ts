/**
 * Error Types and Constants for the Multi-Tenant Booking Platform
 * 
 * This file defines all error types, codes, and utilities for consistent error handling
 * across the application as specified in PRD Section 12.4.
 */

// ============================================
// ERROR CODES (from PRD Section 12.4)
// ============================================

/**
 * Required error codes from PRD Section 12.4
 */
export const ERROR_CODES = {
  // Authentication errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  
  // Business errors
  BUSINESS_NOT_FOUND: 'BUSINESS_NOT_FOUND',
  BUSINESS_NOT_BOOKABLE: 'BUSINESS_NOT_BOOKABLE',
  
  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  
  // Service errors
  SERVICE_NOT_FOUND: 'SERVICE_NOT_FOUND',
  STAFF_NOT_ELIGIBLE: 'STAFF_NOT_ELIGIBLE',
  
  // Booking errors
  BOOKING_TIME_UNAVAILABLE: 'BOOKING_TIME_UNAVAILABLE',
  BOOKING_POLICY_VIOLATION: 'BOOKING_POLICY_VIOLATION',
  BOOKING_NOT_CANCELLABLE: 'BOOKING_NOT_CANCELLABLE',
  BOOKING_NOT_RESCHEDULABLE: 'BOOKING_NOT_RESCHEDULABLE',
  
  // Token errors
  MANAGEMENT_TOKEN_INVALID: 'MANAGEMENT_TOKEN_INVALID',
  MANAGEMENT_TOKEN_EXPIRED: 'MANAGEMENT_TOKEN_EXPIRED',
  
  // Idempotency errors
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  
  // Entitlement errors
  ENTITLEMENT_LIMIT_REACHED: 'ENTITLEMENT_LIMIT_REACHED',
  
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  
  // Payment errors
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  
  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

/**
 * Type for error codes
 */
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ============================================
// ERROR MESSAGES
// ============================================

/**
 * User-friendly error messages for each error code
 * These messages are safe to return to clients
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.AUTH_REQUIRED]: 'Authentication is required to access this resource.',
  [ERROR_CODES.FORBIDDEN]: 'You do not have permission to access this resource.',
  [ERROR_CODES.BUSINESS_NOT_FOUND]: 'The requested business could not be found.',
  [ERROR_CODES.BUSINESS_NOT_BOOKABLE]: 'This business is not currently accepting bookings.',
  [ERROR_CODES.VALIDATION_FAILED]: 'The request contains invalid data.',
  [ERROR_CODES.SERVICE_NOT_FOUND]: 'The requested service could not be found.',
  [ERROR_CODES.STAFF_NOT_ELIGIBLE]: 'The selected staff member is not available for this service.',
  [ERROR_CODES.BOOKING_TIME_UNAVAILABLE]: 'That appointment time is no longer available.',
  [ERROR_CODES.BOOKING_POLICY_VIOLATION]: 'This booking violates the business booking policy.',
  [ERROR_CODES.BOOKING_NOT_CANCELLABLE]: 'This booking cannot be cancelled at this time.',
  [ERROR_CODES.BOOKING_NOT_RESCHEDULABLE]: 'This booking cannot be rescheduled at this time.',
  [ERROR_CODES.MANAGEMENT_TOKEN_INVALID]: 'The booking management link is invalid.',
  [ERROR_CODES.MANAGEMENT_TOKEN_EXPIRED]: 'The booking management link has expired.',
  [ERROR_CODES.IDEMPOTENCY_CONFLICT]: 'This request has already been processed.',
  [ERROR_CODES.ENTITLEMENT_LIMIT_REACHED]: 'This action exceeds your current plan limits.',
  [ERROR_CODES.RATE_LIMITED]: 'Too many requests. Please try again later.',
  [ERROR_CODES.PAYMENT_REQUIRED]: 'Payment is required to complete this action.',
  [ERROR_CODES.PAYMENT_FAILED]: 'Payment processing failed.',
  [ERROR_CODES.INTERNAL_ERROR]: 'An unexpected error occurred. Please try again later.',
  [ERROR_CODES.NOT_IMPLEMENTED]: 'This feature is not yet implemented.',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable.',
} as const;

// ============================================
// HTTP STATUS CODE MAPPING
// ============================================

/**
 * Map error codes to appropriate HTTP status codes
 */
export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  [ERROR_CODES.AUTH_REQUIRED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.BUSINESS_NOT_FOUND]: 404,
  [ERROR_CODES.BUSINESS_NOT_BOOKABLE]: 403,
  [ERROR_CODES.VALIDATION_FAILED]: 400,
  [ERROR_CODES.SERVICE_NOT_FOUND]: 404,
  [ERROR_CODES.STAFF_NOT_ELIGIBLE]: 400,
  [ERROR_CODES.BOOKING_TIME_UNAVAILABLE]: 409, // Conflict
  [ERROR_CODES.BOOKING_POLICY_VIOLATION]: 400,
  [ERROR_CODES.BOOKING_NOT_CANCELLABLE]: 400,
  [ERROR_CODES.BOOKING_NOT_RESCHEDULABLE]: 400,
  [ERROR_CODES.MANAGEMENT_TOKEN_INVALID]: 404,
  [ERROR_CODES.MANAGEMENT_TOKEN_EXPIRED]: 410, // Gone
  [ERROR_CODES.IDEMPOTENCY_CONFLICT]: 409, // Conflict
  [ERROR_CODES.ENTITLEMENT_LIMIT_REACHED]: 402, // Payment Required
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.PAYMENT_REQUIRED]: 402,
  [ERROR_CODES.PAYMENT_FAILED]: 402,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.NOT_IMPLEMENTED]: 501,
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
} as const;

// ============================================
// ERROR INTERFACES
// ============================================

/**
 * Field error for validation failures
 */
export interface FieldError {
  field: string;
  code: string;
  message: string;
  expected?: string;
  received?: string;
}

/**
 * API error response structure (from PRD Section 12.3)
 */
export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    field_errors?: FieldError[];
    request_id?: string;
    correlation_id?: string;
    timestamp?: string;
  };
}

/**
 * Internal error with additional context
 */
export interface ApplicationError extends Error {
  code: ErrorCode;
  statusCode: number;
  fieldErrors?: FieldError[];
  requestId?: string;
  correlationId?: string;
  businessId?: string;
  isOperational: boolean;
  cause?: Error;
}

/**
 * Options for creating application errors
 */
export interface CreateErrorOptions {
  code: ErrorCode;
  message?: string;
  fieldErrors?: FieldError[];
  statusCode?: number;
  requestId?: string;
  correlationId?: string;
  businessId?: string;
  cause?: Error;
  isOperational?: boolean;
}

// ============================================
// ERROR CLASSES
// ============================================

/**
 * Base application error class
 */
export class AppError extends Error implements ApplicationError {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly fieldErrors?: FieldError[];
  public readonly requestId?: string;
  public readonly correlationId?: string;
  public readonly businessId?: string;
  public readonly isOperational: boolean;
  public readonly cause?: Error;
  public readonly timestamp: string;

  constructor(options: CreateErrorOptions) {
    const code = options.code;
    const message = options.message || ERROR_MESSAGES[code];
    const statusCode = options.statusCode || ERROR_CODE_HTTP_STATUS[code];

    super(message);

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);

    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.fieldErrors = options.fieldErrors;
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
    this.businessId = options.businessId;
    this.isOperational = options.isOperational !== undefined ? options.isOperational : true;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Convert to API error response
   */
  toApiResponse(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        field_errors: this.fieldErrors,
        request_id: this.requestId,
        correlation_id: this.correlationId,
        timestamp: this.timestamp,
      },
    };
  }

  /**
   * Convert to plain object for logging
   */
  toLogObject() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      fieldErrors: this.fieldErrors,
      requestId: this.requestId,
      correlationId: this.correlationId,
      businessId: this.businessId,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Validation error class
 */
export class ValidationError extends AppError {
  constructor(options: Omit<CreateErrorOptions, 'code'>) {
    super({ 
      code: ERROR_CODES.VALIDATION_FAILED, 
      ...options 
    });
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends AppError {
  constructor(options: Omit<CreateErrorOptions, 'code'>) {
    super({ 
      code: ERROR_CODES.AUTH_REQUIRED, 
      statusCode: 401,
      ...options 
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends AppError {
  constructor(options: Omit<CreateErrorOptions, 'code'>) {
    super({ 
      code: ERROR_CODES.FORBIDDEN, 
      statusCode: 403,
      ...options 
    });
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends AppError {
  constructor(resource: string, options: Omit<CreateErrorOptions, 'code' | 'message'> = {}) {
    super({ 
      code: ERROR_CODES.BUSINESS_NOT_FOUND, 
      statusCode: 404,
      message: `${resource} not found`,
      ...options 
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error class (for booking conflicts, etc.)
 */
export class ConflictError extends AppError {
  constructor(options: Omit<CreateErrorOptions, 'code'>) {
    super({ 
      code: ERROR_CODES.BOOKING_TIME_UNAVAILABLE, 
      statusCode: 409,
      ...options 
    });
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends AppError {
  constructor(options: Omit<CreateErrorOptions, 'code'>) {
    super({ 
      code: ERROR_CODES.RATE_LIMITED, 
      statusCode: 429,
      ...options 
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Internal server error class
 */
export class InternalServerError extends AppError {
  constructor(options: Omit<CreateErrorOptions, 'code'>) {
    super({ 
      code: ERROR_CODES.INTERNAL_ERROR, 
      statusCode: 500,
      isOperational: false,
      ...options 
    });
    this.name = 'InternalServerError';
  }
}

// ============================================
// ERROR UTILITY FUNCTIONS
// ============================================

/**
 * Create an error from an error code
 */
export function createError(code: ErrorCode, options: Omit<CreateErrorOptions, 'code'> = {}): AppError {
  return new AppError({ code, ...options });
}

/**
 * Create a validation error with field errors
 */
export function createValidationError(
  fieldErrors: FieldError[],
  options: Omit<CreateErrorOptions, 'code' | 'fieldErrors'> = {}
): ValidationError {
  return new ValidationError({ 
    fieldErrors, 
    ...options 
  });
}

/**
 * Create a not found error
 */
export function createNotFoundError(
  resource: string,
  options: Omit<CreateErrorOptions, 'code' | 'message'> = {}
): NotFoundError {
  return new NotFoundError(resource, options);
}

/**
 * Check if an error is an application error
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError || 
         (error instanceof Error && 
          'code' in error && 
          'statusCode' in error);
}

/**
 * Convert any error to an AppError
 */
export function toAppError(error: unknown, options: Partial<CreateErrorOptions> = {}): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError({
      message: error.message,
      cause: error,
      ...options,
    });
  }

  return new InternalServerError({
    message: String(error),
    ...options,
  });
}

/**
 * Create a standardized API error response
 */
export function createApiErrorResponse(
  error: unknown,
  requestId?: string,
  correlationId?: string
): ApiErrorResponse {
  const appError = toAppError(error, { requestId, correlationId });
  return appError.toApiResponse();
}

// ============================================
// EXPORTS
// ============================================

export {
  ERROR_CODES as errorCodes,
  ERROR_MESSAGES as errorMessages,
  ERROR_CODE_HTTP_STATUS as errorCodeHttpStatus,
};

export default {
  // Error codes
  ERROR_CODES,
  errorCodes: ERROR_CODES,
  
  // Error messages
  ERROR_MESSAGES,
  errorMessages: ERROR_MESSAGES,
  
  // HTTP status mapping
  ERROR_CODE_HTTP_STATUS,
  errorCodeHttpStatus: ERROR_CODE_HTTP_STATUS,
  
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  
  // Interfaces
  type ErrorCode,
  type FieldError,
  type ApiErrorResponse,
  type ApplicationError,
  type CreateErrorOptions,
  
  // Utility functions
  createError,
  createValidationError,
  createNotFoundError,
  isAppError,
  toAppError,
  createApiErrorResponse,
};
