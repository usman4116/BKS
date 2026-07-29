/**
 * Staff API Endpoints
 * 
 * GET /api/v1/staff - List staff profiles for the current business
 * POST /api/v1/staff - Create a new staff profile
 * 
 * This endpoint implements staff management as specified in PRD Section UC-004
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
  createStaffProfileSchema,
  updateStaffProfileSchema,
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
  createStaffService,
  CreateStaffProfileRequest,
  UpdateStaffProfileRequest,
  StaffProfileListOptions,
  StaffServiceAssignment
} from '../../../../domains/staff/service';
import { eq, and } from 'drizzle-orm';

// Request schema for creating a staff profile
const createStaffProfileRequestSchema = createStaffProfileSchema.extend({
  // Add any additional staff-specific fields here
});

// Request schema for updating a staff profile
const updateStaffProfileRequestSchema = updateStaffProfileSchema.extend({
  // Add any additional staff-specific fields here
});

// Request schema for staff service assignments
const staffServiceAssignmentSchema = z.object({
  serviceId: z.string().uuid(),
  durationOverrideMinutes: z.number().int().min(5).max(720).optional(),
  priceOverrideMinor: z.number().int().min(0).max(10000000).optional(),
  isActive: z.boolean().optional(),
});

// Request schema for reordering staff
const reorderStaffRequestSchema = z.object({
  staffOrders: z.array(z.object({
    staffId: z.string().uuid(),
    displayOrder: z.number().int().min(0),
  })),
});

/**
 * GET /api/v1/staff
 * List staff profiles for the current business
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Listing staff profiles', {
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
    const includePrivate = searchParams.get('includePrivate') !== 'false'; // default true
    const locationId = searchParams.get('locationId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') as 'displayName' | 'displayOrder' | 'createdAt' || 'displayOrder';
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
    
    // Get staff service
    const staffService = createStaffService({ ...context, businessId: session.businessId });
    
    // List staff profiles
    const result = await staffService.listStaffProfiles(session.businessId, {
      includeInactive,
      includePrivate,
      locationId,
      page,
      limit,
      sortBy,
      sortOrder,
    });
    
    // Enrich staff profiles with service information
    const enrichedStaff = await Promise.all(
      result.staff.map(async (staff) => {
        const assignments = await staffService.getStaffServices(staff.id);
        const serviceIds = assignments.map(a => a.serviceId);
        const services = await db.query.services.findMany({
          where: (services, { inArray }) => inArray(services.id, serviceIds),
        });
        
        return {
          ...staff,
          services: services.map(service => ({
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            priceMinor: service.priceMinor,
            currency: service.currency,
          })),
          serviceCount: services.length,
        };
      })
    );
    
    logger.info('Staff profiles listed successfully', {
      requestId,
      correlationId,
      businessId: session.businessId,
      count: result.total,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        staff: enrichedStaff,
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
    logger.error('Failed to list staff profiles', {
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
      message: 'An unexpected error occurred while listing staff profiles',
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
 * POST /api/v1/staff
 * Create a new staff profile
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Creating staff profile', {
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
    let requestBody: CreateStaffProfileRequest;
    try {
      const body = await request.json();
      requestBody = validate(createStaffProfileRequestSchema, body);
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
    
    // Get staff service
    const staffService = createStaffService({ ...context, businessId: session.businessId });
    
    // Create staff profile
    const staff = await staffService.createStaffProfile(session.businessId, requestBody);
    
    logger.info('Staff profile created successfully', {
      requestId,
      correlationId,
      staffId: staff.id,
      businessId: session.businessId,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        staff: {
          id: staff.id,
          businessId: staff.businessId,
          locationId: staff.locationId,
          displayName: staff.displayName,
          bio: staff.bio,
          photoUrl: staff.photoUrl,
          isActive: staff.isActive,
          isPublic: staff.isPublic,
          displayOrder: staff.displayOrder,
          internalNotes: staff.internalNotes,
          color: staff.color,
          createdAt: staff.createdAt.toISOString(),
          updatedAt: staff.updatedAt.toISOString(),
        },
        message: 'Staff profile created successfully',
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
    logger.error('Failed to create staff profile', {
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
      message: 'An unexpected error occurred while creating staff profile',
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
 * GET /api/v1/staff/{id}
 * Get a specific staff profile by ID
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
    
    logger.info('Getting staff profile by ID', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
      staffId: id,
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
    
    // Get staff service
    const staffService = createStaffService({ ...context, businessId: session.businessId });
    
    // Get staff profile with details
    const staff = await staffService.getStaffProfileWithDetails(id);
    
    // Verify staff profile belongs to the business
    if (staff.businessId !== session.businessId) {
      const error = new AuthorizationError({
        requestId,
        correlationId,
        message: 'Staff profile does not belong to the current business',
      });
      
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': requestId,
          'X-Correlation-ID': correlationId,
        },
      });
    }
    
    logger.info('Staff profile retrieved successfully', {
      requestId,
      correlationId,
      staffId: id,
      businessId: session.businessId,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        staff: {
          id: staff.id,
          businessId: staff.businessId,
          locationId: staff.locationId,
          location: staff.location ? {
            id: staff.location.id,
            name: staff.location.name,
            city: staff.location.city,
          } : null,
          displayName: staff.displayName,
          bio: staff.bio,
          photoUrl: staff.photoUrl,
          isActive: staff.isActive,
          isPublic: staff.isPublic,
          displayOrder: staff.displayOrder,
          internalNotes: staff.internalNotes,
          color: staff.color,
          services: staff.services.map(service => ({
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            priceMinor: service.priceMinor,
            currency: service.currency,
          })),
          serviceCount: staff.serviceCount,
          bookingCount: staff.bookingCount,
          createdAt: staff.createdAt.toISOString(),
          updatedAt: staff.updatedAt.toISOString(),
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
    logger.error('Failed to get staff profile by ID', {
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
      message: 'An unexpected error occurred while getting staff profile',
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
 * PATCH /api/v1/staff/{id}
 * Update a staff profile
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
    
    logger.info('Updating staff profile', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
      staffId: id,
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
    let requestBody: UpdateStaffProfileRequest;
    try {
      const body = await request.json();
      requestBody = validate(updateStaffProfileRequestSchema, body);
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
    
    // Get staff service
    const staffService = createStaffService({ ...context, businessId: session.businessId });
    
    // Update staff profile
    const staff = await staffService.updateStaffProfile(id, session.businessId, requestBody);
    
    logger.info('Staff profile updated successfully', {
      requestId,
      correlationId,
      staffId: id,
      businessId: session.businessId,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        staff: {
          id: staff.id,
          businessId: staff.businessId,
          locationId: staff.locationId,
          displayName: staff.displayName,
          bio: staff.bio,
          photoUrl: staff.photoUrl,
          isActive: staff.isActive,
          isPublic: staff.isPublic,
          displayOrder: staff.displayOrder,
          internalNotes: staff.internalNotes,
          color: staff.color,
          createdAt: staff.createdAt.toISOString(),
          updatedAt: staff.updatedAt.toISOString(),
        },
        message: 'Staff profile updated successfully',
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
    logger.error('Failed to update staff profile', {
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
      message: 'An unexpected error occurred while updating staff profile',
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
 * DELETE /api/v1/staff/{id}
 * Delete a staff profile (soft delete - deactivate)
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
    
    logger.info('Deleting staff profile', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
      staffId: id,
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
    
    // Get staff service
    const staffService = createStaffService({ ...context, businessId: session.businessId });
    
    // Delete staff profile
    const staff = await staffService.deleteStaffProfile(id, session.businessId);
    
    logger.info('Staff profile deleted successfully', {
      requestId,
      correlationId,
      staffId: id,
      businessId: session.businessId,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        staff: {
          id: staff.id,
          businessId: staff.businessId,
          displayName: staff.displayName,
          isActive: staff.isActive,
          isPublic: staff.isPublic,
          updatedAt: staff.updatedAt.toISOString(),
        },
        message: 'Staff profile deleted successfully',
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
    logger.error('Failed to delete staff profile', {
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
      message: 'An unexpected error occurred while deleting staff profile',
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
 * POST /api/v1/staff/{id}/services
 * Assign services to a staff profile
 */
export async function POST_SERVICES(
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
    
    logger.info('Assigning services to staff profile', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
      staffId: id,
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
    let requestBody: { serviceAssignments: StaffServiceAssignment[] };
    try {
      const body = await request.json();
      const validatedBody = validate(
        z.object({
          serviceAssignments: z.array(staffServiceAssignmentSchema),
        }),
        body
      );
      requestBody = validatedBody;
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
    
    // Get staff service
    const staffService = createStaffService({ ...context, businessId: session.businessId });
    
    // Assign services to staff
    const assignments = await staffService.assignServicesToStaff(
      id,
      session.businessId,
      requestBody.serviceAssignments
    );
    
    logger.info('Services assigned to staff profile successfully', {
      requestId,
      correlationId,
      staffId: id,
      businessId: session.businessId,
      assignmentCount: assignments.length,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        assignments: assignments.map(a => ({
          id: a.id,
          businessId: a.businessId,
          staffProfileId: a.staffProfileId,
          serviceId: a.serviceId,
          durationOverrideMinutes: a.durationOverrideMinutes,
          priceOverrideMinor: a.priceOverrideMinor,
          isActive: a.isActive,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
        message: 'Services assigned to staff profile successfully',
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
    logger.error('Failed to assign services to staff profile', {
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
      message: 'An unexpected error occurred while assigning services to staff profile',
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
 * POST /api/v1/staff/reorder
 * Reorder staff profiles
 */
export async function POST_REORDER(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Reordering staff profiles', {
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
    let requestBody: { staffOrders: { staffId: string; displayOrder: number }[] };
    try {
      const body = await request.json();
      requestBody = validate(reorderStaffRequestSchema, body);
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
    
    // Get staff service
    const staffService = createStaffService({ ...context, businessId: session.businessId });
    
    // Reorder staff profiles
    const staff = await staffService.reorderStaffProfiles(
      session.businessId,
      requestBody.staffOrders
    );
    
    logger.info('Staff profiles reordered successfully', {
      requestId,
      correlationId,
      businessId: session.businessId,
      staffCount: staff.length,
      durationMs: Date.now() - startTime,
    });
    
    // Return success response
    return NextResponse.json({
      data: {
        staff: staff.map(s => ({
          id: s.id,
          businessId: s.businessId,
          displayName: s.displayName,
          displayOrder: s.displayOrder,
          updatedAt: s.updatedAt.toISOString(),
        })),
        message: 'Staff profiles reordered successfully',
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
    logger.error('Failed to reorder staff profiles', {
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
      message: 'An unexpected error occurred while reordering staff profiles',
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
export { GET_BY_ID as GET, PATCH_BY_ID as PATCH, DELETE_BY_ID as DELETE, POST_SERVICES };

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
