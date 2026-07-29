/**
 * Test Setup for Multi-Tenant Booking Platform
 * 
 * This file sets up the test environment for Vitest.
 * It configures database connections, mocks, and global test utilities.
 */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { config } from 'dotenv';
import { logger } from '../src/infrastructure/observability/logger';

// Load environment variables from .env.test or .env
config({ path: '.env.test' });
config({ path: '.env' });

// Mock global objects
declare global {
  namespace NodeJS {
    interface Global {
      testRequestId: string;
      testCorrelationId: string;
      testBusinessId: string;
    }
  }
}

// Test configuration
const TEST_CONFIG = {
  requestId: `test-req-${Date.now()}`,
  correlationId: `test-corr-${Date.now()}`,
  businessId: '00000000-0000-0000-0000-000000000000',
  timeout: 10000,
};

// Set up global test context
global.testRequestId = TEST_CONFIG.requestId;
global.testCorrelationId = TEST_CONFIG.correlationId;
global.testBusinessId = TEST_CONFIG.businessId;

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  }

  // Configure logger for tests
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';

  // Mock date for consistent test results
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  // Clean up timers
  vi.useRealTimers();
});

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks();
  
  // Reset test request IDs
  global.testRequestId = `test-req-${Date.now()}`;
  global.testCorrelationId = `test-corr-${Date.now()}`;
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});

// Test utilities
export const testUtils = {
  /**
   * Generate a test request ID
   */
  generateRequestId: () => `test-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

  /**
   * Generate a test correlation ID
   */
  generateCorrelationId: () => `test-corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

  /**
   * Generate a test business ID
   */
  generateBusinessId: () => `test-biz-${Math.random().toString(36).substr(2, 8)}`,

  /**
   * Generate a test UUID
   */
  generateUUID: () => `test-uuid-${Math.random().toString(36).substr(2, 8)}`,

  /**
   * Generate a test email
   */
  generateEmail: (prefix?: string) => {
    const base = prefix || 'test';
    return `${base}-${Date.now()}@example.com`;
  },

  /**
   * Generate a test phone number
   */
  generatePhone: () => `+44123456789${Math.floor(Math.random() * 1000)}`,

  /**
   * Generate a test slug
   */
  generateSlug: (prefix?: string) => {
    const base = prefix || 'test';
    return `${base}-${Date.now()}`;
  },

  /**
   * Wait for a specified duration
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Assert that a promise rejects with a specific error
   */
  expectReject: async <T>(promise: Promise<T>, errorType?: new (...args: unknown[]) => Error) => {
    try {
      await promise;
      throw new Error('Expected promise to reject');
    } catch (error) {
      if (errorType && !(error instanceof errorType)) {
        throw new Error(`Expected error of type ${errorType.name}, got ${(error as Error).constructor.name}`);
      }
      return error;
    }
  },

  /**
   * Create a mock function
   */
  createMockFn: <T extends (...args: unknown[]) => unknown>(implementation?: T) => {
    const mockFn = vi.fn(implementation);
    return mockFn as unknown as T & { mock: typeof mockFn };
  },
};

// Export test configuration
export const TEST_CONFIG = {
  ...TEST_CONFIG,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:test@localhost:5432/test',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
};

// Mock database for unit tests (not integration tests)
export const mockDb = {
  query: {
    businesses: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    // Add more mock methods as needed
  },
};

// Export test utilities
export default testUtils;