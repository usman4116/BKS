import { NextResponse } from 'next/server';
import { z } from 'zod';

// Health check response schema
const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string().datetime(),
  version: z.string(),
  environment: z.string(),
  services: z.record(z.object({
    status: z.enum(['up', 'down']),
    latency: z.number().nullable(),
    message: z.string().nullable(),
  })),
  checks: z.record(z.object({
    status: z.enum(['passed', 'failed', 'skipped']),
    message: z.string().nullable(),
    duration: z.number().nullable(),
  })),
});

type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * GET /api/v1/health
 * Health check endpoint for monitoring and load balancer health checks
 * 
 * This endpoint provides:
 * - Basic liveness check
 * - Service dependency status
 * - Database connectivity verification
 * - Environment information
 */
export async function GET() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  // Basic health information
  const healthData: HealthResponse = {
    status: 'healthy',
    timestamp,
    version: process.env.npm_package_version || '0.1.0',
    environment: process.env.NODE_ENV || 'development',
    services: {},
    checks: {},
  };

  try {
    // Check database connectivity
    const dbCheck = await checkDatabaseConnectivity();
    healthData.checks.database = dbCheck;
    
    if (dbCheck.status === 'failed') {
      healthData.status = 'unhealthy';
    }

    // Check external service dependencies
    const serviceChecks = await checkExternalServices();
    healthData.services = serviceChecks;
    
    // Check if any services are down
    const downServices = Object.values(serviceChecks).filter(s => s.status === 'down');
    if (downServices.length > 0) {
      healthData.status = 'degraded';
    }

    // Add performance metrics
    healthData.checks.performance = {
      status: 'passed',
      message: `Response time: ${Date.now() - startTime}ms`,
      duration: Date.now() - startTime,
    };

    return NextResponse.json(healthData, { 
      status: healthData.status === 'healthy' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    // If we can't even build the response, return a minimal unhealthy response
    return NextResponse.json({
      status: 'unhealthy' as const,
      timestamp,
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, {
      status: 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Content-Type': 'application/json',
      },
    });
  }
}

/**
 * Check database connectivity
 */
async function checkDatabaseConnectivity(): Promise<HealthResponse['checks']['database']> {
  const startTime = Date.now();
  
  try {
    // Import database client dynamically to avoid circular dependencies
    const { db } = await import('@/infrastructure/db/client');
    
    // Simple query to test connectivity
    const result = await db.query.businesses.findFirst({
      columns: { id: true },
      limit: 1,
    });
    
    // If we get here, database is accessible
    return {
      status: 'passed',
      message: 'Database connection successful',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Database connection failed';
    return {
      status: 'failed',
      message: errorMessage,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Check external service dependencies
 */
async function checkExternalServices(): Promise<HealthResponse['services']> {
  const services: HealthResponse['services'] = {};
  
  // Check Clerk authentication
  services.clerk = await checkClerkService();
  
  // Check Stripe (if configured)
  if (process.env.STRIPE_SECRET_KEY) {
    services.stripe = await checkStripeService();
  }
  
  // Check email service (if configured)
  if (process.env.RESEND_API_KEY || process.env.POSTMARK_SERVER_TOKEN) {
    services.email = await checkEmailService();
  }
  
  // Check Redis (if configured)
  if (process.env.REDIS_URL) {
    services.redis = await checkRedisService();
  }
  
  return services;
}

/**
 * Check Clerk authentication service
 */
async function checkClerkService(): Promise<HealthResponse['services']['clerk']> {
  const startTime = Date.now();
  
  try {
    // Simple check - if Clerk keys are configured, service is considered up
    // In production, we might make a test API call
    if (!process.env.CLERK_SECRET_KEY) {
      return {
        status: 'down',
        latency: null,
        message: 'Clerk not configured',
      };
    }
    
    return {
      status: 'up',
      latency: Date.now() - startTime,
      message: 'Clerk service configured',
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Clerk service check failed',
    };
  }
}

/**
 * Check Stripe service
 */
async function checkStripeService(): Promise<HealthResponse['services']['stripe']> {
  const startTime = Date.now();
  
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return {
        status: 'down',
        latency: null,
        message: 'Stripe not configured',
      };
    }
    
    // Simple version check
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // Note: We don't make actual API calls in health checks to avoid rate limits
    
    return {
      status: 'up',
      latency: Date.now() - startTime,
      message: 'Stripe service configured',
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Stripe service check failed',
    };
  }
}

/**
 * Check email service
 */
async function checkEmailService(): Promise<HealthResponse['services']['email']> {
  const startTime = Date.now();
  
  try {
    if (!process.env.RESEND_API_KEY && !process.env.POSTMARK_SERVER_TOKEN) {
      return {
        status: 'down',
        latency: null,
        message: 'Email service not configured',
      };
    }
    
    return {
      status: 'up',
      latency: Date.now() - startTime,
      message: 'Email service configured',
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Email service check failed',
    };
  }
}

/**
 * Check Redis service
 */
async function checkRedisService(): Promise<HealthResponse['services']['redis']> {
  const startTime = Date.now();
  
  try {
    if (!process.env.REDIS_URL) {
      return {
        status: 'down',
        latency: null,
        message: 'Redis not configured',
      };
    }
    
    // Simple Redis connectivity check
    const redis = require('redis');
    const client = redis.createClient({ url: process.env.REDIS_URL });
    
    await client.connect();
    await client.ping();
    await client.disconnect();
    
    return {
      status: 'up',
      latency: Date.now() - startTime,
      message: 'Redis service connected',
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Redis service check failed',
    };
  }
}

// Allow HEAD requests for load balancer health checks
export async function HEAD() {
  return GET();
}