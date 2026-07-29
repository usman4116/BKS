/**
 * Business Onboarding API Endpoint
 * 
 * POST /api/v1/businesses/onboarding
 * Creates a new business and provisions it for the authenticated user
 * 
 * This endpoint implements UC-001 from the PRD: Business signup and onboarding
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../../../infrastructure/db/client';
import * as schema from '../../../../../infrastructure/db/schema';
import { logger } from '../../../../../infrastructure/observability/logger';
import { 
  AppError, 
  ERROR_CODES, 
  createError,
  createValidationError,
  ValidationError,
  ConflictError
} from '../../../../../shared/errors/types';
import { 
  createBusinessSchema,
  validate 
} from '../../../../../shared/validation/schemas';
import { 
  getCurrentSession,
  provisionBusiness,
  getOnboardingState,
  publishBusiness,
  checkPublishRequirements
} from '../../../../../infrastructure/auth/clerk';
import { 
  getTenantContext,
  generateRequestId,
  generateCorrelationId
} from '../../../../../infrastructure/auth/tenant-context';
import { v4 as uuidv4 } from 'uuid';

// Request schema for business onboarding
const onboardingRequestSchema = createBusinessSchema.extend({
  // Add any additional onboarding-specific fields here
});

type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;

/**
 * POST /api/v1/businesses/onboarding
 * Create a new business and start the onboarding process
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Starting business onboarding', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    
    // Get Clerk session
    const session = await getCurrentSession(request);
    
    if (!session || !session.user) {
      const error = new AppError({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: 'Authentication is required to create a business',
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
    let requestBody: OnboardingRequest;
    try {
      const body = await request.json();
      requestBody = validate(onboardingRequestSchema, body);
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
    
    // Check if business with this slug already exists
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
    
    // Check if user already has a business
    if (session.businessId) {
      const error = new AppError({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'User is already associated with a business',
        requestId,
        correlationId,
        fieldErrors: [
          {
            field: 'user',
            code: 'already_has_business',
            message: 'This user is already associated with a business',
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
    
    // Get or create Clerk organization
    let organizationId: string;
    
    if (session.organization) {
      // User already has an organization
      organizationId = session.organization.id;
    } else {
      // Create a new organization for this business
      const clerkClient = (await import('@clerk/nextjs/server')).clerkClient;
      const organization = await clerkClient.organizations.createOrganization({
        name: requestBody.name,
        slug: requestBody.slug,
      });
      
      organizationId = organization.id;
      
      // Add user to the organization as owner
      await clerkClient.organizations.createOrganizationMembership({
        organizationId: organization.id,
        userId: session.user.id,
        role: 'org:admin', // Clerk's role for organization owner
      });
    }
    
    // Provision the business
    const business = await provisionBusiness(
      session.user.id,
      organizationId,
      {
        name: requestBody.name,
        slug: requestBody.slug,
        businessType: requestBody.businessType,
        timezone: requestBody.timezone,
        currency: requestBody.currency,
        email: requestBody.email,
        phoneE164: requestBody.phoneE164,
        logoUrl: requestBody.logoUrl,
        primaryColor: requestBody.primaryColor,
        accentColor: requestBody.accentColor,
      },
      { requestId, correlationId }
    );
    
    // Get onboarding state
    const onboardingState = await getOnboardingState(business.id);
    
    logger.info('Business onboarding completed successfully', {
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
          status: business.status,
          bookingPagePublished: business.bookingPagePublished,
          createdAt: business.createdAt.toISOString(),
        },
        onboarding: {
          currentStep: onboardingState.currentStep,
          completedSteps: onboardingState.completedSteps,
          isComplete: onboardingState.isComplete,
          canPublish: onboardingState.canPublish,
          missingRequirements: onboardingState.missingRequirements,
        },
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
    logger.error('Business onboarding failed', {
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
      message: 'An unexpected error occurred during business onboarding',
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
 * GET /api/v1/businesses/onboarding
 * Get the onboarding state for the current user's business
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Get tenant context
  const context = getTenantContext(request) || { requestId, correlationId };
  
  try {
    logger.info('Getting onboarding state', {
      requestId,
      correlationId,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    
    // Get Clerk session
    const session = await getCurrentSession(request);
    
    if (!session || !session.user) {
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
    
    if (!session.businessId) {
      const error = new AppError({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'User is not associated with a business',
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
    
    // Get onboarding state
    const onboardingState = await getOnboardingState(session.businessId);
    
    // Get business details
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.id, session.businessId),
    });
    
    if (!business) {
      const error = new AppError({
        code: ERROR_CODES.BUSINESS_NOT_FOUND,
        message: 'Business not found',
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
    
    logger.info('Onboarding state retrieved successfully', {
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
          timezone: business.timezone,
          currency: business.currency,
          createdAt: business.createdAt.toISOString(),
          updatedAt: business.updatedAt.toISOString(),
        },
        onboarding: {
          currentStep: onboardingState.currentStep,
          completedSteps: onboardingState.completedSteps,
          isComplete: onboardingState.isComplete,
          canPublish: onboardingState.canPublish,
          missingRequirements: onboardingState.missingRequirements,
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
    logger.error('Failed to get onboarding state', {
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
      message: 'An unexpected error occurred while getting onboarding state',
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
      'Allow': 'GET, POST, HEAD, OPTIONS',
      'Content-Type': 'application/json',
    },
  });
}