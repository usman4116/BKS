/**
 * Health Endpoint Unit Tests
 * 
 * Tests for the health check endpoint functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, HEAD } from '../../src/app/api/v1/health/route';
import { NextResponse } from 'next/server';

// Mock the database client
vi.mock('../../src/infrastructure/db/client', () => ({
  db: {
    query: {
      businesses: {
        findFirst: vi.fn().mockResolvedValue({ id: 'test-id' }),
      },
    },
  },
  getQueryClient: vi.fn(),
  getDirectClient: vi.fn(),
}));

describe('Health Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/health', () => {
    it('should return a healthy status response', async () => {
      const response = await GET();
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('status', 'healthy');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('environment');
      expect(data).toHaveProperty('services');
      expect(data).toHaveProperty('checks');
    });

    it('should include database check in response', async () => {
      const response = await GET();
      const data = await response.json();
      
      expect(data.checks).toHaveProperty('database');
      expect(data.checks.database).toHaveProperty('status', 'passed');
    });

    it('should include performance metrics', async () => {
      const response = await GET();
      const data = await response.json();
      
      expect(data.checks).toHaveProperty('performance');
      expect(data.checks.performance).toHaveProperty('status', 'passed');
      expect(data.checks.performance).toHaveProperty('duration');
    });

    it('should return unhealthy status if database check fails', async () => {
      // Mock database failure
      vi.mock('../../src/infrastructure/db/client', () => ({
        db: {
          query: {
            businesses: {
              findFirst: vi.fn().mockRejectedValue(new Error('Database connection failed')),
            },
          },
        },
      }));

      // Need to re-import to get the new mock
      const { GET: GETWithFailure } = await import('../../src/app/api/v1/health/route');
      const response = await GETWithFailure();
      
      expect(response.status).toBe(503);
      
      const data = await response.json();
      expect(data).toHaveProperty('status', 'unhealthy');
      expect(data.checks.database).toHaveProperty('status', 'failed');
    });

    it('should include service status checks', async () => {
      const response = await GET();
      const data = await response.json();
      
      expect(data.services).toHaveProperty('clerk');
      // Other services may or may not be present depending on configuration
    });

    it('should set appropriate cache headers', async () => {
      const response = await GET();
      
      expect(response.headers.get('Cache-Control')).toContain('no-store');
      expect(response.headers.get('Cache-Control')).toContain('no-cache');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('HEAD /api/v1/health', () => {
    it('should return the same response as GET', async () => {
      const getResponse = await GET();
      const headResponse = await HEAD();
      
      expect(headResponse.status).toBe(getResponse.status);
      
      // HEAD responses typically don't have a body
      // but our implementation returns the same as GET for simplicity
    });
  });
});

describe('Health Response Schema', () => {
  it('should have the correct structure', async () => {
    const response = await GET();
    const data = await response.json();
    
    // Verify the response structure matches our schema
    expect(data).toMatchObject({
      status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      version: expect.any(String),
      environment: expect.any(String),
      services: expect.any(Object),
      checks: expect.any(Object),
    });
  });
});