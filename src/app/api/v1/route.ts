/**
 * API v1 Base Route
 * 
 * This file handles requests to the /api/v1 base path
 * and provides version information and API documentation links
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../infrastructure/observability/logger';
import { generateRequestId, generateCorrelationId } from '../../../infrastructure/auth/tenant-context';
import { ERROR_CODES, AppError } from '../../../shared/errors/types';

/**
 * GET /api/v1
 * API version information and documentation links
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  try {
    logger.info('API v1 base endpoint accessed', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    
    return NextResponse.json({
      data: {
        version: '1.0.0',
        name: 'Multi-Tenant Booking Platform API',
        description: 'REST API for the Multi-Tenant Booking Platform',
        documentation: {
          openApi: '/api/v1/docs',
          redoc: '/api/v1/docs/redoc',
          swagger: '/api/v1/docs/swagger',
        },
        endpoints: {
          health: '/api/v1/health',
          businesses: {
            onboarding: '/api/v1/businesses/onboarding',
            details: '/api/v1/businesses',
            publish: '/api/v1/businesses/publish',
            unpublish: '/api/v1/businesses/unpublish',
          },
          public: {
            businesses: '/api/v1/public/businesses/{slug}',
            availability: '/api/v1/public/businesses/{slug}/availability',
            bookings: '/api/v1/public/businesses/{slug}/bookings',
            manage: '/api/v1/public/manage/{token}',
          },
          webhooks: {
            clerk: '/api/v1/webhooks/clerk',
            stripe: '/api/v1/webhooks/stripe',
          },
        },
        features: {
          authentication: 'Clerk',
          database: 'PostgreSQL with RLS',
          caching: 'Redis',
          jobs: 'Inngest/Trigger.dev',
          payments: 'Stripe',
          email: 'Resend/Postmark',
        },
      },
      meta: {
        requestId,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    }, {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        'X-Correlation-ID': correlationId,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
    
  } catch (error) {
    logger.error('API v1 base endpoint failed', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    if (error instanceof AppError) {
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    const error = new AppError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      requestId,
      correlationId,
      cause: error instanceof Error ? error : undefined,
    });
    
    return NextResponse.json(error.toApiResponse(), {
      status: error.statusCode,
      headers: {
        'X-Request-ID': requestId,
        'X-Correlation-ID': correlationId,
      },
    });
  }
}

/**
 * HEAD /api/v1
 * Health check for API base path
 */
export async function HEAD(request: NextRequest) {
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  return NextResponse.json(null, {
    status: 200,
    headers: {
      'X-Request-ID': requestId,
      'X-Correlation-ID': correlationId,
    },
  });
}

/**
 * OPTIONS /api/v1
 * CORS preflight for API base path
 */
export async function OPTIONS() {
  return NextResponse.json(null, {
    status: 204,
    headers: {
      'Allow': 'GET, HEAD, OPTIONS',
      'Content-Type': 'application/json',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-Correlation-ID',
      'Access-Control-Max-Age': '86400',
    },
  });
}
