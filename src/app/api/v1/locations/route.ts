/**
 * Locations API Endpoints
 * 
 * GET /api/v1/locations - List locations for the current business
 * POST /api/v1/locations - Create a new location
 * 
 * This endpoint implements location management as specified in PRD Section UC-003
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
  NotFoundError,
  ValidationError,
  AuthorizationError
} from '../../../../shared/errors/types';
import { 
  createLocationSchema,
  updateLocationSchema,
  validate 
} from '../../../../shared/validation/schemas';
import { 
  getCurrentSession,
  requireBusinessUser
} from '../../../../infrastructure/auth/clerk';
import { 
  getTenantContext,
  generateRequestId,
  generateCorrelationId
} from '../../../../infrastructure/auth/tenant-context';
import { 
  createLocationsService,
  CreateLocationRequest,
  UpdateLocationRequest,
  LocationListOptions
} from '../../../../domains/locations/service';
import { eq, and } from 'drizzle-orm';

// Request schema for creating a location
const createLocationRequestSchema = createLocationSchema.extend({
  // Add any additional location-specific fields here
});

// Request schema for updating a location
const updateLocationRequestSchema = updateLocationSchema.extend({
  // Add any additional location-specific fields here
});

/**
 * GET /api/v1/locations
 * List locations for the current business
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Listing locations', {
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
    
    // Parse query parameters
    const { searchParams } = request.nextUrl;
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') as 'name' | 'displayOrder' | 'createdAt' || 'displayOrder';
    const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' || 'asc';
    
    // Validate query parameters
    if (page < 1 || limit < 1 || limit > 100) {
      const error = new ValidationError({
        requestId,
        correlationId,
        fieldErrors: [
          {
            field: 'page',
            code: 'invalid',
            message: 'Page must be a positive integer',
          },
          {
            field: 'limit',
            code: 'invalid',
            message: 'Limit must be between 1 and 100',
          },
        ],
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    // Get locations service
    const locationsService = createLocationsService({ ...context, businessId: session.businessId });
    
    // List locations
    const result = await locationsService.listLocations(session.businessId, {
      includeInactive,
      page,
      limit,
      sortBy,
      sortOrder,
    });
    
    logger.info('Locations listed successfully', {
      requestId,
      correlationId,
      businessId: session.businessId,
      count: result.total,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        locations: result.locations,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
          hasMore: result.hasMore,
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
    logger.error('Failed to list locations', {
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
      message: 'An unexpected error occurred while listing locations',
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
 * POST /api/v1/locations
 * Create a new location
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Creating location', {
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
    let requestBody: CreateLocationRequest;
    try {
      const body = await request.json();
      requestBody = validate(createLocationRequestSchema, body);
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
    
    // Get locations service
    const locationsService = createLocationsService({ ...context, businessId: session.businessId });
    
    // Create location
    const location = await locationsService.createLocation(session.businessId, requestBody);
    
    logger.info('Location created successfully', {
      requestId,
      correlationId,
      locationId: location.id,
      businessId: session.businessId,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        location: {
          id: location.id,
          businessId: location.businessId,
          name: location.name,
          addressLine1: location.addressLine1,
          addressLine2: location.addressLine2,
          city: location.city,
          region: location.region,
          postalCode: location.postalCode,
          countryCode: location.countryCode,
          timezoneOverride: location.timezoneOverride,
          phoneE164: location.phoneE164,
          latitude: location.latitude,
          longitude: location.longitude,
          isPrimary: location.isPrimary,
          isActive: location.isActive,
          isVirtual: location.isVirtual,
          publicInstructions: location.publicInstructions,
          displayOrder: location.displayOrder,
          createdAt: location.createdAt.toISOString(),
          updatedAt: location.updatedAt.toISOString(),
        },
        message: 'Location created successfully',
      },
      meta: {
        requestId,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    }, {
      status: 201,
      headers: {
        'X-Request-ID': requestId,
        'X-Correlation-ID': correlationId,
      },
    });
    
  } catch (error) {
    logger.error('Failed to create location', {
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
      message: 'An unexpected error occurred while creating location',
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
 * GET /api/v1/locations/{id}
 * Get a specific location by ID
 */
export async function GET_BY_ID(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    const { id } = await params;
    
    logger.info('Getting location by ID', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
      locationId: id,
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
    
    // Get locations service
    const locationsService = createLocationsService({ ...context, businessId: session.businessId });
    
    // Get location
    const location = await locationsService.getLocationWithDetails(id);
    
    // Verify location belongs to the business
    if (location.businessId !== session.businessId) {
      const error = new AuthorizationError({
        requestId,
        correlationId,
        message: 'Location does not belong to the current business',
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    logger.info('Location retrieved successfully', {
      requestId,
      correlationId,
      locationId: id,
      businessId: session.businessId,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        location: {
          id: location.id,
          businessId: location.businessId,
          name: location.name,
          addressLine1: location.addressLine1,
          addressLine2: location.addressLine2,
          city: location.city,
          region: location.region,
          postalCode: location.postalCode,
          countryCode: location.countryCode,
          timezoneOverride: location.timezoneOverride,
          phoneE164: location.phoneE164,
          latitude: location.latitude,
          longitude: location.longitude,
          isPrimary: location.isPrimary,
          isActive: location.isActive,
          isVirtual: location.isVirtual,
          publicInstructions: location.publicInstructions,
          displayOrder: location.displayOrder,
          staffCount: location.staffCount,
          serviceCount: location.serviceCount,
          createdAt: location.createdAt.toISOString(),
          updatedAt: location.updatedAt.toISOString(),
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
    logger.error('Failed to get location by ID', {
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
      message: 'An unexpected error occurred while getting location',
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
 * PATCH /api/v1/locations/{id}
 * Update a location
 */
export async function PATCH_BY_ID(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    const { id } = await params;
    
    logger.info('Updating location', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
      locationId: id,
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
    let requestBody: UpdateLocationRequest;
    try {
      const body = await request.json();
      requestBody = validate(updateLocationRequestSchema, body);
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
    
    // Get locations service
    const locationsService = createLocationsService({ ...context, businessId: session.businessId });
    
    // Update location
    const location = await locationsService.updateLocation(id, session.businessId, requestBody);
    
    logger.info('Location updated successfully', {
      requestId,
      correlationId,
      locationId: id,
      businessId: session.businessId,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        location: {
          id: location.id,
          businessId: location.businessId,
          name: location.name,
          addressLine1: location.addressLine1,
          addressLine2: location.addressLine2,
          city: location.city,
          region: location.region,
          postalCode: location.postalCode,
          countryCode: location.countryCode,
          timezoneOverride: location.timezoneOverride,
          phoneE164: location.phoneE164,
          latitude: location.latitude,
          longitude: location.longitude,
          isPrimary: location.isPrimary,
          isActive: location.isActive,
          isVirtual: location.isVirtual,
          publicInstructions: location.publicInstructions,
          displayOrder: location.displayOrder,
          createdAt: location.createdAt.toISOString(),
          updatedAt: location.updatedAt.toISOString(),
        },
        message: 'Location updated successfully',
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
    logger.error('Failed to update location', {
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
      message: 'An unexpected error occurred while updating location',
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
 * DELETE /api/v1/locations/{id}
 * Delete a location (soft delete - deactivate)
 */
export async function DELETE_BY_ID(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    const { id } = await params;
    
    logger.info('Deleting location', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
      locationId: id,
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
    
    // Get locations service
    const locationsService = createLocationsService({ ...context, businessId: session.businessId });
    
    // Delete location
    const location = await locationsService.deleteLocation(id, session.businessId);
    
    logger.info('Location deleted successfully', {
      requestId,
      correlationId,
      locationId: id,
      businessId: session.businessId,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        location: {
          id: location.id,
          businessId: location.businessId,
          name: location.name,
          isActive: location.isActive,
          isPrimary: location.isPrimary,
          updatedAt: location.updatedAt.toISOString(),
        },
        message: 'Location deleted successfully',
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
    logger.error('Failed to delete location', {
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
      message: 'An unexpected error occurred while deleting location',
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

// Route handlers for dynamic segments
export { GET_BY_ID as GET, PATCH_BY_ID as PATCH, DELETE_BY_ID as DELETE };

// Allow HEAD requests for caching
export async function HEAD(request: NextRequest) {
  return GET(request);
}

// Allow OPTIONS for CORS preflight
export async function OPTIONS() {
  return NextResponse.json(null, {
    status: 204,
    headers: {
      'Allow': 'GET, POST, PATCH, DELETE, HEAD, OPTIONS',
      'Content-Type': 'application/json',
    },
  });
}
