/**
 * Application Middleware
 * 
 * This middleware handles:
 * - Request logging
 * - Tenant context establishment
 * - Clerk authentication
 * - CORS headers
 * - Security headers
 * - Rate limiting (future)
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  tenantContextMiddleware,
  tenantContextCleanupMiddleware,
  clerkMiddleware
} from './infrastructure/auth/tenant-context';
import { logger } from './infrastructure/observability/logger';
import { generateRequestId, generateCorrelationId } from './infrastructure/auth/tenant-context';

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================

// Paths that should skip middleware
const SKIP_PATHS = [
  '/favicon.ico',
  '/_next/static',
  '/_next/image',
  '/_next/data',
  '/api/v1/health',
];

// Paths that require authentication
const AUTH_REQUIRED_PATHS = [
  '/api/v1/businesses',
  '/api/v1/locations',
  '/api/v1/staff',
  '/api/v1/services',
  '/api/v1/availability',
  '/api/v1/bookings',
  '/api/v1/customers',
  '/api/v1/admin',
];

// Paths that require business user authentication
const BUSINESS_AUTH_REQUIRED_PATHS = [
  '/api/v1/businesses',
  '/api/v1/locations',
  '/api/v1/staff',
  '/api/v1/services',
  '/api/v1/availability',
  '/api/v1/bookings',
  '/api/v1/customers',
];

// ============================================
// MAIN MIDDLEWARE FUNCTION
// ============================================

export async function middleware(request: NextRequest) {
  const startTime = Date.now();
  const path = request.nextUrl.pathname;
  const method = request.method;
  
  // Generate request IDs
  const requestId = request.headers.get('X-Request-ID') || generateRequestId();
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  
  // Skip middleware for certain paths
  if (shouldSkipMiddleware(path)) {
    return NextResponse.next();
  }
  
  // Log request start
  logger.info('Request started', {
    requestId,
    correlationId,
    path,
    method,
    ip: request.ip,
    userAgent: request.headers.get('user-agent'),
  });
  
  // Apply Clerk middleware for authentication
  const clerkResponse = await clerkMiddleware(request);
  if (clerkResponse) {
    return clerkResponse;
  }
  
  // Apply tenant context middleware
  const tenantContextResponse = await tenantContextMiddleware(request);
  if (tenantContextResponse) {
    return tenantContextResponse;
  }
  
  // Apply authentication requirements
  if (requiresAuth(path)) {
    const authResponse = await requireAuth(request);
    if (authResponse) {
      return authResponse;
    }
  }
  
  // Apply business authentication requirements
  if (requiresBusinessAuth(path)) {
    const businessAuthResponse = await requireBusinessAuth(request);
    if (businessAuthResponse) {
      return businessAuthResponse;
    }
  }
  
  // Add security headers
  const response = addSecurityHeaders(NextResponse.next());
  
  // Add request tracking headers
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Correlation-ID', correlationId);
  
  // Log request completion
  response.then((res) => {
    logger.info('Request completed', {
      requestId,
      correlationId,
      path,
      method,
      status: res.status,
      durationMs: Date.now() - startTime,
    });
    return res;
  });
  
  return response;
}

// ============================================
// MIDDLEWARE HELPER FUNCTIONS
// ============================================

/**
 * Check if middleware should be skipped for this path
 */
function shouldSkipMiddleware(path: string): boolean {
  return SKIP_PATHS.some(skipPath => path.startsWith(skipPath));
}

/**
 * Check if this path requires authentication
 */
function requiresAuth(path: string): boolean {
  return AUTH_REQUIRED_PATHS.some(authPath => path.startsWith(authPath));
}

/**
 * Check if this path requires business user authentication
 */
function requiresBusinessAuth(path: string): boolean {
  return BUSINESS_AUTH_REQUIRED_PATHS.some(businessPath => path.startsWith(businessPath));
}

/**
 * Require authentication middleware
 */
async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const { requireClerkAuth } = await import('./infrastructure/auth/clerk');
  return requireClerkAuth(request);
}

/**
 * Require business authentication middleware
 */
async function requireBusinessAuth(request: NextRequest): Promise<NextResponse | null> {
  const { requireBusinessUser } = await import('./infrastructure/auth/tenant-context');
  return requireBusinessUser(request);
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // CORS headers (configure as needed)
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-Correlation-ID');
  response.headers.set('Access-Control-Max-Age', '86400');
  
  // Cache control for API responses
  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
  
  return response;
}

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================

export const config = {
  // Match all paths except those handled by Next.js static files
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/v1/health).*)',
  ],
  
  // Enable middleware for all HTTP methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
};

// ============================================
// EXPORTS
// ============================================

export {
  tenantContextCleanupMiddleware,
};
