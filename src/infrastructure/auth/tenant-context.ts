/**
 * Tenant Context Management
 * 
 * This module provides utilities for managing tenant context in the application.
 * It ensures that every request has proper tenant isolation as specified in PRD Section 11.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { logger, generateRequestId, generateCorrelationId } from '../observability/logger';
import { AppError, ERROR_CODES, createError } from '../../shared/errors/types';
import { setTenantContext, clearTenantContext, TenantContext } from '../db/rls';

// ============================================
// TYPES
// ============================================

/**
 * Extended tenant context with request information
 */
export interface RequestTenantContext extends TenantContext {
  requestId: string;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
  path: string;
  method: string;
}

/**
 * Clerk user information from authentication
 */
export interface ClerkUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  username?: string;
}

/**
 * Clerk organization information
 */
export interface ClerkOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/**
 * Authenticated session information
 */
export interface AuthSession {
  user: ClerkUser;
  organization?: ClerkOrganization;
  businessId?: string;
  isPlatformAdmin: boolean;
  isBusinessUser: boolean;
  role?: string;
}

// ============================================
// CONSTANTS
// ============================================

// Request context key for storing tenant context
const TENANT_CONTEXT_KEY = 'tenantContext';

// Platform admin user IDs from environment
const PLATFORM_ADMIN_USER_IDS = process.env.PLATFORM_ADMIN_USER_IDS?.split(',') || [];

// ============================================
// CONTEXT MANAGEMENT
// ============================================

/**
 * Get tenant context from request
 */
export function getTenantContext(request: NextRequest): RequestTenantContext | null {
  return request[TENANT_CONTEXT_KEY as keyof NextRequest] as RequestTenantContext | null;
}

/**
 * Set tenant context on request
 */
export function setTenantContextOnRequest(
  request: NextRequest,
  context: RequestTenantContext
): void {
  (request as NextRequest & { [key: string]: unknown })[TENANT_CONTEXT_KEY] = context;
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

/**
 * Generate a management token for booking management
 */
export function generateManagementToken(): string {
  // Generate a high-entropy token
  const token = require('crypto').randomBytes(32).toString('hex');
  return token;
}

/**
 * Hash a management token for storage
 */
export function hashManagementToken(token: string): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(token);
  return hash.digest('hex');
}

/**
 * Verify a management token
 */
export async function verifyManagementToken(
  token: string,
  businessId: string
): Promise<boolean> {
  try {
    const tokenHash = hashManagementToken(token);
    
    const result = await db.query.bookingManagementTokens.findFirst({
      where: (tokens, { and, eq, gt }) => and(
        eq(tokens.tokenHash, tokenHash),
        eq(tokens.businessId, businessId),
        gt(tokens.expiresAt, new Date())
      ),
    });
    
    return result !== undefined;
  } catch (error) {
    logger.error('Failed to verify management token', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ============================================
// BUSINESS RESOLUTION
// ============================================

/**
 * Resolve business ID from various sources
 */
export async function resolveBusinessId(
  request: NextRequest,
  session?: AuthSession
): Promise<string | null> {
  // Try to get business ID from session first
  if (session?.businessId) {
    return session.businessId;
  }

  // Try to get business ID from Clerk organization
  if (session?.organization?.id) {
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.externalAuthOrgId, session.organization.id),
    });
    
    if (business) {
      return business.id;
    }
  }

  // Try to get business ID from request headers (for API requests)
  const businessIdHeader = request.headers.get('X-Business-ID');
  if (businessIdHeader) {
    return businessIdHeader;
  }

  // Try to get business ID from URL path (for public requests)
  const path = request.nextUrl.pathname;
  const slugMatch = path.match(/(?:\/public\/businesses\/|\/api\/v1\/businesses\/)([^\/]+)/);
  if (slugMatch) {
    const slug = slugMatch[1];
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.slug, slug),
    });
    
    if (business) {
      return business.id;
    }
  }

  return null;
}

/**
 * Resolve business from slug
 */
export async function resolveBusinessFromSlug(slug: string): Promise<schema.Business | null> {
  try {
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.slug, slug),
    });
    
    return business || null;
  } catch (error) {
    logger.error('Failed to resolve business from slug', {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Get Clerk session from request
 * This is a placeholder - actual implementation will use Clerk's Next.js integration
 */
export async function getClerkSession(request: NextRequest): Promise<AuthSession | null> {
  try {
    // In a real implementation, this would use Clerk's getAuth() function
    // For now, we'll return a mock session for development
    
    if (process.env.NODE_ENV === 'development') {
      // Mock session for development
      return {
        user: {
          id: 'user_123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
        },
        organization: {
          id: 'org_123',
          name: 'Test Business',
          slug: 'test-business',
          createdAt: new Date().toISOString(),
        },
        isPlatformAdmin: false,
        isBusinessUser: true,
        role: 'owner',
      };
    }
    
    // For production, this would use Clerk's actual session management
    // const { auth } = await import('@clerk/nextjs');
    // const session = await auth().getSession();
    
    return null;
  } catch (error) {
    logger.error('Failed to get Clerk session', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if user is a platform admin
 */
export function isPlatformAdmin(userId: string): boolean {
  return PLATFORM_ADMIN_USER_IDS.includes(userId);
}

/**
 * Check if user is a business user
 */
export async function isBusinessUser(userId: string, businessId: string): Promise<boolean> {
  try {
    const businessUser = await db.query.businessUsers.findFirst({
      where: (users, { and, eq }) => and(
        eq(users.externalAuthUserId, userId),
        eq(users.businessId, businessId),
        eq(users.status, 'active')
      ),
    });
    
    return businessUser !== undefined;
  } catch (error) {
    logger.error('Failed to check if user is business user', {
      userId,
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Middleware to extract and set tenant context from request
 * This ensures that every request has proper tenant isolation
 */
export async function tenantContextMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const startTime = Date.now();
  const path = request.nextUrl.pathname;
  const method = request.method;
  
  // Generate request IDs
  const requestId = generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Skip tenant context for health checks and public assets
  if (path.startsWith('/api/v1/health') || path.startsWith('/favicon.ico')) {
    return null;
  }
  
  try {
    // Get Clerk session
    const session = await getClerkSession(request);
    
    // Resolve business ID
    const businessId = await resolveBusinessId(request, session);
    
    // Determine user role
    const userId = session?.user?.id;
    const isPlatformAdmin = userId ? isPlatformAdmin(userId) : false;
    const isBusinessUser = userId && businessId ? 
      await isBusinessUser(userId, businessId) : false;
    
    // Create tenant context
    const tenantContext: RequestTenantContext = {
      requestId,
      correlationId,
      businessId,
      userId,
      isPlatformAdmin,
      isBusinessUser,
      ipAddress: request.ip,
      userAgent: request.headers.get('user-agent'),
      path,
      method,
    };
    
    // Set tenant context on request
    setTenantContextOnRequest(request, tenantContext);
    
    // Set database session context for RLS
    setTenantContext({
      businessId,
      userId,
      isPlatformAdmin,
      isBusinessUser,
    });
    
    logger.info('Tenant context established', {
      requestId,
      correlationId,
      path,
      method,
      businessId: businessId ? '***MASKED***' : undefined,
      userId: userId ? '***MASKED***' : undefined,
      isPlatformAdmin,
      isBusinessUser,
      durationMs: Date.now() - startTime,
    });
    
    return null; // Continue to next middleware/handler
    
  } catch (error) {
    logger.error('Failed to establish tenant context', {
      requestId,
      correlationId,
      path,
      method,
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Clear any partial context
    clearTenantContext();
    
    // Return error response
    const error = createError(ERROR_CODES.INTERNAL_ERROR, {
      requestId,
      correlationId,
      message: 'Failed to establish tenant context',
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
 * Middleware to clean up tenant context after request
 */
export function tenantContextCleanupMiddleware(response: NextResponse): NextResponse {
  // Clear database session context
  clearTenantContext();
  
  return response;
}

// ============================================
// AUTHORIZATION UTILITIES
// ============================================

/**
 * Check if current user has permission to access a business
 */
export async function checkBusinessAccess(
  request: NextRequest,
  businessId: string
): Promise<boolean> {
  const context = getTenantContext(request);
  
  if (!context) {
    return false;
  }
  
  // Platform admins can access any business
  if (context.isPlatformAdmin) {
    return true;
  }
  
  // Business users can only access their own business
  if (context.isBusinessUser && context.businessId === businessId) {
    return true;
  }
  
  return false;
}

/**
 * Check if current user has permission to perform an action
 */
export function checkPermission(
  request: NextRequest,
  requiredRole: string | string[]
): boolean {
  const context = getTenantContext(request);
  
  if (!context) {
    return false;
  }
  
  // Platform admins have all permissions
  if (context.isPlatformAdmin) {
    return true;
  }
  
  // Check if user has required role
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  
  // In a real implementation, we would check the user's role from the session
  // For now, we'll assume business users have the required permissions
  if (context.isBusinessUser) {
    return true;
  }
  
  return false;
}

/**
 * Require authentication middleware
 */
export async function requireAuthMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const context = getTenantContext(request);
  
  if (!context || !context.userId) {
    const error = createError(ERROR_CODES.AUTH_REQUIRED, {
      requestId: context?.requestId,
      correlationId: context?.correlationId,
      message: 'Authentication is required',
    });
    
    return NextResponse.json(error.toApiResponse(), {
      status: error.statusCode,
      headers: {
        'X-Request-ID': context?.requestId || generateRequestId(),
        'X-Correlation-ID': context?.correlationId || generateCorrelationId(),
      },
    });
  }
  
  return null; // Continue
}

/**
 * Require business access middleware
 */
export async function requireBusinessAccessMiddleware(
  request: NextRequest,
  businessId: string
): Promise<NextResponse | null> {
  const hasAccess = await checkBusinessAccess(request, businessId);
  
  if (!hasAccess) {
    const context = getTenantContext(request);
    const error = createError(ERROR_CODES.FORBIDDEN, {
      requestId: context?.requestId,
      correlationId: context?.correlationId,
      message: 'You do not have permission to access this business',
    });
    
    return NextResponse.json(error.toApiResponse(), {
      status: error.statusCode,
      headers: {
        'X-Request-ID': context?.requestId || generateRequestId(),
        'X-Correlation-ID': context?.correlationId || generateCorrelationId(),
      },
    });
  }
  
  return null; // Continue
}

// ============================================
// EXPORTS
// ============================================

export {
  TENANT_CONTEXT_KEY,
  PLATFORM_ADMIN_USER_IDS,
  getTenantContext,
  setTenantContextOnRequest,
  generateManagementToken,
  hashManagementToken,
  verifyManagementToken,
  resolveBusinessId,
  resolveBusinessFromSlug,
  getClerkSession,
  isPlatformAdmin,
  isBusinessUser,
  tenantContextMiddleware,
  tenantContextCleanupMiddleware,
  checkBusinessAccess,
  checkPermission,
  requireAuthMiddleware,
  requireBusinessAccessMiddleware,
};

export type {
  RequestTenantContext,
  ClerkUser,
  ClerkOrganization,
  AuthSession,
};
