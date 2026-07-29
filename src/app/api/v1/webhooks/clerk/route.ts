/**
 * Clerk Webhook Endpoint
 * 
 * POST /api/v1/webhooks/clerk
 * Handles webhook events from Clerk for user and organization management
 * 
 * This endpoint implements the Clerk synchronization specified in PRD Section 11.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../../infrastructure/observability/logger';
import { 
  AppError, 
  ERROR_CODES, 
  createError 
} from '../../../../../shared/errors/types';
import { 
  handleClerkWebhook,
  ClerkWebhookPayload
} from '../../../../../infrastructure/auth/clerk';
import { 
  generateRequestId,
  generateCorrelationId
} from '../../../../../infrastructure/auth/tenant-context';

/**
 * POST /api/v1/webhooks/clerk
 * Handle Clerk webhook events
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  try {
    logger.info('Processing Clerk webhook request', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    
    // Verify webhook signature
    const signature = request.headers.get('x-clerk-signature') || '';
    const rawBody = await request.text();
    
    // Parse the webhook payload
    let event: ClerkWebhookPayload;
    try {
      event = JSON.parse(rawBody) as ClerkWebhookPayload;
    } catch (error) {
      const errorResponse = new AppError({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Invalid webhook payload format',
        requestId,
        correlationId,
      });
      
      return NextResponse.json(errorResponse.toApiResponse(), {
        status: errorResponse.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Process the webhook
    await handleClerkWebhook(event, rawBody, signature);
    
    logger.info('Clerk webhook processed successfully', {
      requestId,
      correlationId,
      eventType: event.type,
      eventId: event.id,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        success: true,
        message: 'Webhook processed successfully',
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
      },
    });
    
  } catch (error) {
    logger.error('Clerk webhook processing failed', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
      message: 'An unexpected error occurred while processing Clerk webhook',
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
 * HEAD /api/v1/webhooks/clerk
 * Health check for webhook endpoint
 */
export async function HEAD() {
  return NextResponse.json(null, {
    status: 200,
    headers: {
      'Allow': 'POST, HEAD, OPTIONS',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * OPTIONS /api/v1/webhooks/clerk
 * CORS preflight for webhook endpoint
 */
export async function OPTIONS() {
  return NextResponse.json(null, {
    status: 204,
    headers: {
      'Allow': 'POST, HEAD, OPTIONS',
      'Content-Type': 'application/json',
    },
  });
}
