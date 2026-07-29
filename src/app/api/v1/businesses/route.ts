/**
 * Business Management API Endpoints
 * 
 * GET /api/v1/businesses - Get current business details
 * PATCH /api/v1/businesses - Update business settings
 * 
 * These endpoints implement business management functionality from PRD Section UC-002
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../../infrastructure/db/client';
import * as schema from '../../../../infrastructure/db/schema';
import { logger } from '../../../../infrastructure/observability/logger';
import { 
  AppError, 
  ERROR_CODES, 
  createError,
  createValidationError,
  ValidationError,
  NotFoundError,
  AuthorizationError
} from '../../../../shared/errors/types';
import { 
  updateBusinessSchema,
  businessSettingsSchema,
  validate 
} from '../../../../shared/validation/schemas';
import { 
  getCurrentSession,
  publishBusiness,
  unpublishBusiness,
  checkPublishRequirements
} from '../../../../infrastructure/auth/clerk';
import { 
  getTenantContext,
  requireBusinessUser,
  generateRequestId,
  generateCorrelationId
} from '../../../../infrastructure/auth/tenant-context';

// Request schema for updating business
const updateBusinessRequestSchema = updateBusinessSchema.extend({
  // Add any additional business update fields here
});

type UpdateBusinessRequest = z.infer<typeof updateBusinessRequestSchema>;

// Request schema for updating business settings
const updateBusinessSettingsRequestSchema = businessSettingsSchema;

type UpdateBusinessSettingsRequest = z.infer<typeof updateBusinessSettingsRequestSchema>;

/**
 * GET /api/v1/businesses
 * Get the current business details for the authenticated user
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Getting business details', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    
    // Check authentication
    const authResponse = await requireBusinessUser(request);
    if (authResponse) {
      return authResponse;
    }
    
    const session = await getCurrentSession(request);
    
    if (!session || !session.businessId) {
      const error = new AppError({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: 'Authentication is required',
        requestId,
        correlationId,
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Get business details
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.id, session.businessId),
    });
    
    if (!business) {
      const error = new NotFoundError('Business', {
        requestId,
        correlationId,
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Get business user details
    const businessUser = await db.query.businessUsers.findFirst({
      where: (users, { and, eq }) => and(
        eq(users.businessId, business.id),
        eq(users.externalAuthUserId, session.user.id)
      ),
    });
    
    // Get location count
    const locationCount = await db.query.locations.count({
      where: (locations, { eq }) => eq(locations.businessId, business.id),
    });
    
    // Get staff count
    const staffCount = await db.query.staffProfiles.count({
      where: (staff, { eq }) => eq(staff.businessId, business.id),
    });
    
    // Get service count
    const serviceCount = await db.query.services.count({
      where: (services, { eq }) => eq(services.businessId, business.id),
    });
    
    // Get booking count
    const bookingCount = await db.query.bookings.count({
      where: (bookings, { eq }) => eq(bookings.businessId, business.id),
    });
    
    // Get subscription info
    const subscription = await db.query.subscriptions.findFirst({
      where: (subscriptions, { eq }) => eq(subscriptions.businessId, business.id),
    });
    
    logger.info('Business details retrieved successfully', {
      requestId,
      correlationId,
      businessId: business.id,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        business: {
          id: business.id,
          externalAuthOrgId: business.externalAuthOrgId,
          name: business.name,
          slug: business.slug,
          businessType: business.businessType,
          status: business.status,
          timezone: business.timezone,
          currency: business.currency,
          locale: business.locale,
          email: business.email,
          phoneE164: business.phoneE164,
          logoUrl: business.logoUrl,
          primaryColor: business.primaryColor,
          accentColor: business.accentColor,
          bookingPagePublished: business.bookingPagePublished,
          bookingHorizonDays: business.bookingHorizonDays,
          minimumNoticeMinutes: business.minimumNoticeMinutes,
          cancellationNoticeMinutes: business.cancellationNoticeMinutes,
          slotIncrementMinutes: business.slotIncrementMinutes,
          createdAt: business.createdAt.toISOString(),
          updatedAt: business.updatedAt.toISOString(),
        },
        user: businessUser ? {
          id: businessUser.id,
          role: businessUser.role,
          status: businessUser.status,
          email: businessUser.email,
          createdAt: businessUser.createdAt.toISOString(),
        } : null,
        statistics: {
          locations: locationCount,
          staff: staffCount,
          services: serviceCount,
          bookings: bookingCount,
        },
        subscription: subscription ? {
          id: subscription.id,
          planKey: subscription.planKey,
          billingStatus: subscription.billingStatus,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
        } : null,
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
    logger.error('Failed to get business details', {
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
      message: 'An unexpected error occurred while getting business details',
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
 * PATCH /api/v1/businesses
 * Update business settings
 */
export async function PATCH(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Updating business settings', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    
    // Check authentication
    const authResponse = await requireBusinessUser(request);
    if (authResponse) {
      return authResponse;
    }
    
    const session = await getCurrentSession(request);
    
    if (!session || !session.businessId) {
      const error = new AppError({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: 'Authentication is required',
        requestId,
        correlationId,
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Parse and validate request body
    let requestBody: UpdateBusinessRequest;
    try {
      const body = await request.json();
      requestBody = validate(updateBusinessRequestSchema, body);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Validation failed')) {
        const validationError = JSON.parse(error.message) as {
          code: string;
          message: string;
          fieldErrors: Array<{ field: string; code: string; message: string }>;
        };
        
        const errorResponse = new ValidationError({
          requestId,
          correlationId,
          fieldErrors: validationError.fieldErrors,
        });
        
        return NextResponse.json(errorResponse.toApiResponse(), {
          status: errorResponse.statusCode,
          headers: {
            'X-Request-ID': requestId,
            'X-Correlation-ID': correlationId,
          },
        });
      }
      
      const error = new AppError({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Invalid request body',
        requestId,
        correlationId,
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Check if business exists
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.id, session.businessId),
    });
    
    if (!business) {
      const error = new NotFoundError('Business', {
        requestId,
        correlationId,
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Check if slug is being changed and if it's available
    if (requestBody.slug && requestBody.slug !== business.slug) {
      const existingBusiness = await db.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.slug, requestBody.slug),
      });
      
      if (existingBusiness) {
        const error = new ConflictError({
          requestId,
          correlationId,
          message: `Business with slug '${requestBody.slug}' already exists`,
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
    
    // Update the business
    const updateData: Partial<schema.Business> = {
      name: requestBody.name,
      slug: requestBody.slug,
      businessType: requestBody.businessType,
      timezone: requestBody.timezone,
      currency: requestBody.currency,
      locale: requestBody.locale,
      email: requestBody.email,
      phoneE164: requestBody.phoneE164,
      logoUrl: requestBody.logoUrl,
      primaryColor: requestBody.primaryColor,
      accentColor: requestBody.accentColor,
      bookingHorizonDays: requestBody.bookingHorizonDays,
      minimumNoticeMinutes: requestBody.minimumNoticeMinutes,
      cancellationNoticeMinutes: requestBody.cancellationNoticeMinutes,
      slotIncrementMinutes: requestBody.slotIncrementMinutes,
      updatedAt: new Date(),
    };
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key as keyof schema.Business] === undefined) {
        delete updateData[key as keyof schema.Business];
      }
    });
    
    const [updatedBusiness] = await db.update(schema.businesses)
      .set(updateData)
      .where(schema.eq(schema.businesses.id, business.id))
      .returning();
    
    if (!updatedBusiness) {
      const error = new AppError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to update business',
        requestId,
        correlationId,
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Create audit event
    await db.insert(schema.auditEvents).values({
      id: (await import('uuid')).v4(),
      businessId: business.id,
      actorType: 'business_user',
      actorId: session.user.id,
      action: 'business.updated',
      targetType: 'business',
      targetId: business.id,
      reason: 'Business settings updated',
      correlationId,
      createdAt: new Date(),
    });
    
    logger.info('Business settings updated successfully', {
      requestId,
      correlationId,
      businessId: business.id,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        business: {
          id: updatedBusiness.id,
          name: updatedBusiness.name,
          slug: updatedBusiness.slug,
          businessType: updatedBusiness.businessType,
          status: updatedBusiness.status,
          timezone: updatedBusiness.timezone,
          currency: updatedBusiness.currency,
          locale: updatedBusiness.locale,
          email: updatedBusiness.email,
          phoneE164: updatedBusiness.phoneE164,
          logoUrl: updatedBusiness.logoUrl,
          primaryColor: updatedBusiness.primaryColor,
          accentColor: updatedBusiness.accentColor,
          bookingPagePublished: updatedBusiness.bookingPagePublished,
          bookingHorizonDays: updatedBusiness.bookingHorizonDays,
          minimumNoticeMinutes: updatedBusiness.minimumNoticeMinutes,
          cancellationNoticeMinutes: updatedBusiness.cancellationNoticeMinutes,
          slotIncrementMinutes: updatedBusiness.slotIncrementMinutes,
          createdAt: updatedBusiness.createdAt.toISOString(),
          updatedAt: updatedBusiness.updatedAt.toISOString(),
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
      },
    });
    
  } catch (error) {
    logger.error('Failed to update business settings', {
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
      message: 'An unexpected error occurred while updating business settings',
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
 * POST /api/v1/businesses/publish
 * Publish the business (make it available for public bookings)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Publishing business', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    
    // Check authentication
    const authResponse = await requireBusinessUser(request);
    if (authResponse) {
      return authResponse;
    }
    
    const session = await getCurrentSession(request);
    
    if (!session || !session.businessId) {
      const error = new AppError({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: 'Authentication is required',
        requestId,
        correlationId,
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Check publish requirements
    const { canPublish, missingRequirements } = await checkPublishRequirements(session.businessId);
    
    if (!canPublish) {
      const error = new AppError({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Business does not meet all publish requirements',
        requestId,
        correlationId,
        fieldErrors: missingRequirements.map(req => ({
          field: 'publish',
          code: 'missing_requirement',
          message: req,
        })),
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Publish the business
    const business = await publishBusiness(
      session.businessId,
      session.user.id,
      { requestId, correlationId }
    );
    
    logger.info('Business published successfully', {
      requestId,
      correlationId,
      businessId: business.id,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug,
          status: business.status,
          bookingPagePublished: business.bookingPagePublished,
          updatedAt: business.updatedAt.toISOString(),
        },
        message: 'Business published successfully and is now available for public bookings',
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
    logger.error('Failed to publish business', {
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
      message: 'An unexpected error occurred while publishing business',
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
 * POST /api/v1/businesses/unpublish
 * Unpublish the business (make it unavailable for public bookings)
 */
export async function UNPUBLISH(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Unpublishing business', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    
    // Check authentication
    const authResponse = await requireBusinessUser(request);
    if (authResponse) {
      return authResponse;
    }
    
    const session = await getCurrentSession(request);
    
    if (!session || !session.businessId) {
      const error = new AppError({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: 'Authentication is required',
        requestId,
        correlationId,
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Unpublish the business
    const business = await unpublishBusiness(
      session.businessId,
      session.user.id,
      { requestId, correlationId }
    );
    
    logger.info('Business unpublished successfully', {
      requestId,
      correlationId,
      businessId: business.id,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug,
          status: business.status,
          bookingPagePublished: business.bookingPagePublished,
          updatedAt: business.updatedAt.toISOString(),
        },
        message: 'Business unpublished successfully and is no longer available for public bookings',
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
    logger.error('Failed to unpublish business', {
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
      message: 'An unexpected error occurred while unpublishing business',
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

// Allow HEAD requests for caching
export async function HEAD(request: NextRequest) {
  return GET(request);
}

// Allow OPTIONS for CORS preflight
export async function OPTIONS() {
  return NextResponse.json(null, {
    status: 204,
    headers: {
      'Allow': 'GET, PATCH, POST, HEAD, OPTIONS',
      'Content-Type': 'application/json',
    },
  });
}
