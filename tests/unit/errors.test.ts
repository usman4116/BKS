/**
 * Error Handling Unit Tests
 * 
 * Tests for the error types and utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_CODE_HTTP_STATUS,
  createError,
  createValidationError,
  createNotFoundError,
  isAppError,
  toAppError,
  createApiErrorResponse,
} from '../../src/shared/errors/types';

describe('Error Types', () => {
  describe('AppError', () => {
    it('should create an error with default values', () => {
      const error = new AppError({ code: ERROR_CODES.INTERNAL_ERROR });
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe(ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR]);
      expect(error.isOperational).toBe(false);
      expect(error.timestamp).toBeDefined();
    });

    it('should create an error with custom message', () => {
      const customMessage = 'Custom error message';
      const error = new AppError({ 
        code: ERROR_CODES.VALIDATION_FAILED, 
        message: customMessage 
      });
      
      expect(error.message).toBe(customMessage);
      expect(error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('should create an error with context', () => {
      const requestId = 'req-123';
      const correlationId = 'corr-456';
      const businessId = 'biz-789';
      
      const error = new AppError({
        code: ERROR_CODES.AUTH_REQUIRED,
        requestId,
        correlationId,
        businessId,
      });
      
      expect(error.requestId).toBe(requestId);
      expect(error.correlationId).toBe(correlationId);
      expect(error.businessId).toBe(businessId);
    });

    it('should create an error with field errors', () => {
      const fieldErrors = [
        { field: 'email', code: 'invalid_email', message: 'Invalid email format' },
        { field: 'name', code: 'too_short', message: 'Name is too short' },
      ];
      
      const error = new AppError({
        code: ERROR_CODES.VALIDATION_FAILED,
        fieldErrors,
      });
      
      expect(error.fieldErrors).toEqual(fieldErrors);
    });

    it('should convert to API response', () => {
      const error = new AppError({
        code: ERROR_CODES.BUSINESS_NOT_FOUND,
        requestId: 'req-123',
        correlationId: 'corr-456',
      });
      
      const apiResponse = error.toApiResponse();
      
      expect(apiResponse).toHaveProperty('error');
      expect(apiResponse.error).toHaveProperty('code', ERROR_CODES.BUSINESS_NOT_FOUND);
      expect(apiResponse.error).toHaveProperty('message');
      expect(apiResponse.error).toHaveProperty('request_id', 'req-123');
      expect(apiResponse.error).toHaveProperty('correlation_id', 'corr-456');
      expect(apiResponse.error).toHaveProperty('timestamp');
    });

    it('should convert to log object', () => {
      const error = new AppError({
        code: ERROR_CODES.INTERNAL_ERROR,
        requestId: 'req-123',
      });
      
      const logObject = error.toLogObject();
      
      expect(logObject).toHaveProperty('error', ERROR_CODES.INTERNAL_ERROR);
      expect(logObject).toHaveProperty('statusCode', 500);
      expect(logObject).toHaveProperty('requestId', 'req-123');
      expect(logObject).toHaveProperty('isOperational', false);
    });
  });

  describe('Specific Error Classes', () => {
    it('should create ValidationError', () => {
      const error = new ValidationError({});
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(error.statusCode).toBe(400);
    });

    it('should create AuthenticationError', () => {
      const error = new AuthenticationError({});
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.code).toBe(ERROR_CODES.AUTH_REQUIRED);
      expect(error.statusCode).toBe(401);
    });

    it('should create AuthorizationError', () => {
      const error = new AuthorizationError({});
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(error.statusCode).toBe(403);
    });

    it('should create NotFoundError', () => {
      const error = new NotFoundError('Business');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.code).toBe(ERROR_CODES.BUSINESS_NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Business not found');
    });

    it('should create ConflictError', () => {
      const error = new ConflictError({});
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.code).toBe(ERROR_CODES.BOOKING_TIME_UNAVAILABLE);
      expect(error.statusCode).toBe(409);
    });

    it('should create RateLimitError', () => {
      const error = new RateLimitError({});
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.code).toBe(ERROR_CODES.RATE_LIMITED);
      expect(error.statusCode).toBe(429);
    });

    it('should create InternalServerError', () => {
      const error = new InternalServerError({});
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(InternalServerError);
      expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('Error Utility Functions', () => {
    it('should create error from code', () => {
      const error = createError(ERROR_CODES.AUTH_REQUIRED);
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ERROR_CODES.AUTH_REQUIRED);
    });

    it('should create validation error with field errors', () => {
      const fieldErrors = [
        { field: 'email', code: 'invalid', message: 'Invalid email' },
      ];
      
      const error = createValidationError(fieldErrors);
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fieldErrors).toEqual(fieldErrors);
    });

    it('should create not found error', () => {
      const error = createNotFoundError('Service');
      
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Service not found');
    });

    it('should check if error is AppError', () => {
      const appError = new AppError({ code: ERROR_CODES.INTERNAL_ERROR });
      const regularError = new Error('Regular error');
      
      expect(isAppError(appError)).toBe(true);
      expect(isAppError(regularError)).toBe(false);
    });

    it('should convert error to AppError', () => {
      const regularError = new Error('Test error');
      const appError = toAppError(regularError);
      
      expect(appError).toBeInstanceOf(InternalServerError);
      expect(appError.message).toBe('Test error');
      expect(appError.cause).toBe(regularError);
    });

    it('should convert string to AppError', () => {
      const appError = toAppError('String error');
      
      expect(appError).toBeInstanceOf(InternalServerError);
      expect(appError.message).toBe('String error');
    });

    it('should return existing AppError unchanged', () => {
      const existingError = new AppError({ code: ERROR_CODES.VALIDATION_FAILED });
      const convertedError = toAppError(existingError);
      
      expect(convertedError).toBe(existingError);
    });

    it('should create API error response', () => {
      const error = new AppError({
        code: ERROR_CODES.BUSINESS_NOT_FOUND,
        requestId: 'req-123',
        correlationId: 'corr-456',
      });
      
      const apiResponse = createApiErrorResponse(error);
      
      expect(apiResponse).toHaveProperty('error');
      expect(apiResponse.error).toHaveProperty('code', ERROR_CODES.BUSINESS_NOT_FOUND);
      expect(apiResponse.error).toHaveProperty('request_id', 'req-123');
      expect(apiResponse.error).toHaveProperty('correlation_id', 'corr-456');
    });

    it('should create API error response from regular error', () => {
      const error = new Error('Test error');
      const apiResponse = createApiErrorResponse(error, 'req-123', 'corr-456');
      
      expect(apiResponse.error).toHaveProperty('code', ERROR_CODES.INTERNAL_ERROR);
      expect(apiResponse.error).toHaveProperty('request_id', 'req-123');
      expect(apiResponse.error).toHaveProperty('correlation_id', 'corr-456');
    });
  });

  describe('Error Constants', () => {
    it('should have all required error codes', () => {
      const requiredCodes = [
        'AUTH_REQUIRED',
        'FORBIDDEN',
        'BUSINESS_NOT_FOUND',
        'BUSINESS_NOT_BOOKABLE',
        'VALIDATION_FAILED',
        'SERVICE_NOT_FOUND',
        'STAFF_NOT_ELIGIBLE',
        'BOOKING_TIME_UNAVAILABLE',
        'BOOKING_POLICY_VIOLATION',
        'BOOKING_NOT_CANCELLABLE',
        'BOOKING_NOT_RESCHEDULABLE',
        'MANAGEMENT_TOKEN_INVALID',
        'MANAGEMENT_TOKEN_EXPIRED',
        'IDEMPOTENCY_CONFLICT',
        'ENTITLEMENT_LIMIT_REACHED',
        'RATE_LIMITED',
        'PAYMENT_REQUIRED',
        'PAYMENT_FAILED',
        'INTERNAL_ERROR',
      ];
      
      requiredCodes.forEach(code => {
        expect(ERROR_CODES).toHaveProperty(code);
      });
    });

    it('should have messages for all error codes', () => {
      Object.keys(ERROR_CODES).forEach(code => {
        const errorCode = ERROR_CODES[code as keyof typeof ERROR_CODES];
        expect(ERROR_MESSAGES).toHaveProperty(errorCode);
      });
    });

    it('should have HTTP status codes for all error codes', () => {
      Object.keys(ERROR_CODES).forEach(code => {
        const errorCode = ERROR_CODES[code as keyof typeof ERROR_CODES];
        expect(ERROR_CODE_HTTP_STATUS).toHaveProperty(errorCode);
      });
    });
  });
});