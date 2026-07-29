/**
 * Public Business Endpoint
 * 
 * GET /api/v1/public/businesses/{slug}
 * Get public business information for booking
 * 
 * This endpoint implements public business access as specified in PRD Section 12.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../../infrastructure/db/client';
import * as schema from '../../../../../../infrastructure/db/schema';
import { logger } from '../../../../../../infrastructure/observability/logger';
import { 
  AppError, 
  ERROR_CODES, 
  createError,
  NotFoundError 
} from '../../../../../../shared/errors/types';
import { 
  getTenantContext,
  generateRequestId,
  generateCorrelationId
} from '../../../../../../infrastructure/auth/tenant-context';

/**
 * GET /api/v1/public/businesses/{slug}
 * Get public business information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    const { slug } = await params;
    
    logger.info('Getting public business information', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
      slug,
    });
    
    // Get the business by slug (RLS will handle public access)
    const business = await db.query.businesses.findFirst({
      where: (businesses, { and, eq }) => and(
        eq(businesses.slug, slug),
        eq(businesses.bookingPagePublished, true),
        eq(businesses.status, 'active')
      ),
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
    
    // Get active locations
    const locations = await db.query.locations.findMany({
      where: (locations, { and, eq }) => and(
        eq(locations.businessId, business.id),
        eq(locations.isActive, true)
      ),
      orderBy: (locations, { asc }) => [asc(locations.displayOrder)],
    });
    
    // Get active, public staff profiles
    const staffProfiles = await db.query.staffProfiles.findMany({
      where: (staff, { and, eq }) => and(
        eq(staff.businessId, business.id),
        eq(staff.isActive, true),
        eq(staff.isPublic, true)
      ),
      orderBy: (staff, { asc }) => [asc(staff.displayOrder)],
    });
    
    // Get active, public service categories
    const serviceCategories = await db.query.serviceCategories.findMany({
      where: (categories, { and, eq }) => and(
        eq(categories.businessId, business.id),
        eq(categories.isActive, true)
      ),
      orderBy: (categories, { asc }) => [asc(categories.displayOrder)],
    });
    
    // Get active, public services
    const services = await db.query.services.findMany({
      where: (services, { and, eq }) => and(
        eq(services.businessId, business.id),
        eq(services.isActive, true),
        eq(services.isPublic, true)
      ),
      orderBy: (services, { asc }) => [asc(services.displayOrder)],
    });
    
    // Get active booking policy
    const bookingPolicy = await db.query.bookingPolicies.findFirst({
      where: (policies, { and, eq }) => and(
        eq(policies.businessId, business.id),
        eq(policies.isActive, true)
      ),
      orderBy: (policies, { desc }) => [desc(policies.version)],
    });
    
    // Get staff-service assignments
    const staffServices = await db.query.staffServices.findMany({
      where: (assignments, { and, eq }) => and(
        eq(assignments.businessId, business.id),
        eq(assignments.isActive, true)
      ),
    });
    
    // Format staff with their services
    const staffWithServices = staffProfiles.map(staff => {
      const staffServiceAssignments = staffServices.filter(
        assignment => assignment.staffProfileId === staff.id
      );
      
      return {
        id: staff.id,
        displayName: staff.displayName,
        bio: staff.bio,
        photoUrl: staff.photoUrl,
        color: staff.color,
        services: staffServiceAssignments.map(assignment => {
          const service = services.find(s => s.id === assignment.serviceId);
          return service ? {
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            priceMinor: service.priceMinor,
            currency: service.currency,
          } : null;
        }).filter(Boolean),
      };
    });
    
    // Format services with their categories
    const servicesWithCategories = services.map(service => {
      const category = serviceCategories.find(cat => cat.id === service.categoryId);
      return {
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        prepBufferMinutes: service.prepBufferMinutes,
        cleanupBufferMinutes: service.cleanupBufferMinutes,
        priceMinor: service.priceMinor,
        currency: service.currency,
        category: category ? {
          id: category.id,
          name: category.name,
        } : null,
      };
    });
    
    logger.info('Public business information retrieved successfully', {
      requestId,
      correlationId,
      businessId: business.id,
      businessName: business.name,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug,
          businessType: business.businessType,
          timezone: business.timezone,
          currency: business.currency,
          locale: business.locale,
          email: business.email,
          phoneE164: business.phoneE164,
          logoUrl: business.logoUrl,
          primaryColor: business.primaryColor,
          accentColor: business.accentColor,
          bookingHorizonDays: business.bookingHorizonDays,
          minimumNoticeMinutes: business.minimumNoticeMinutes,
          slotIncrementMinutes: business.slotIncrementMinutes,
        },
        locations,
        staff: staffWithServices,
        services: servicesWithCategories,
        categories: serviceCategories,
        bookingPolicy: bookingPolicy ? {
          minimumNoticeMinutes: bookingPolicy.minimumNoticeMinutes,
          bookingHorizonDays: bookingPolicy.bookingHorizonDays,
          cancellationNoticeMinutes: bookingPolicy.cancellationNoticeMinutes,
          reschedulingNoticeMinutes: bookingPolicy.reschedulingNoticeMinutes,
          cancellationPolicyText: bookingPolicy.cancellationPolicyText,
          termsText: bookingPolicy.termsText,
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
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
    
  } catch (error) {
    logger.error('Failed to get public business information', {
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
      message: 'An unexpected error occurred while getting public business information',
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
 * HEAD /api/v1/public/businesses/{slug}
 * Head request for caching
 */
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return GET(request, { params });
}

/**
 * OPTIONS /api/v1/public/businesses/{slug}
 * CORS preflight
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
