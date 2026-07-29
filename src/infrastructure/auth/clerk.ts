/**
 * Clerk Authentication Integration
 * 
 * This module provides integration with Clerk authentication service.
 * It handles user authentication, session management, and organization mapping
 * as specified in PRD Section 11 (Tenant Isolation and Authentication).
 */

import { clerkClient, currentUser, auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { logger } from '../observability/logger';
import { 
  AppError, 
  ERROR_CODES, 
  createError,
  AuthenticationError,
  AuthorizationError 
} from '../../shared/errors/types';
import { 
  TenantContext,
  RequestTenantContext,
  ClerkUser,
  ClerkOrganization,
  AuthSession,
  getTenantContext,
  setTenantContextOnRequest,
  generateRequestId,
  generateCorrelationId
} from './tenant-context';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// CONSTANTS
// ============================================

// Clerk API version
const CLERK_API_VERSION = '2024-01-01';

// Session cache TTL in milliseconds
const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// TYPES
// ============================================

/**
 * Clerk session with additional metadata
 */
export interface ClerkSession {
  id: string;
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  username?: string;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
  organizationRole?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Clerk webhook event types
 */
export type ClerkWebhookEventType = 
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'organization.created'
  | 'organization.updated'
  | 'organization.deleted'
  | 'organizationMembership.created'
  | 'organizationMembership.updated'
  | 'organizationMembership.deleted';

/**
 * Clerk webhook payload
 */
export interface ClerkWebhookPayload {
  id: string;
  type: ClerkWebhookEventType;
  data: Record<string, unknown>;
  object: string;
  created: number;
}

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Get the current Clerk user from the request
 * This uses Clerk's Next.js server-side utilities
 */
export async function getCurrentUser(request?: NextRequest): Promise<ClerkUser | null> {
  try {
    const user = await currentUser();
    
    if (!user) {
      return null;
    }
    
    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || '',
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      imageUrl: user.imageUrl || undefined,
      username: user.username || undefined,
    };
  } catch (error) {
    logger.error('Failed to get current Clerk user', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get the current Clerk session
 */
export async function getCurrentSession(request?: NextRequest): Promise<AuthSession | null> {
  try {
    const user = await getCurrentUser(request);
    
    if (!user) {
      return null;
    }
    
    // Get the user's organization membership
    const organization = await getUserOrganization(user.id);
    
    // Check if user is a platform admin
    const isPlatformAdmin = await isPlatformAdminUser(user.id);
    
    // Resolve business ID from organization
    let businessId: string | undefined;
    let isBusinessUser = false;
    let role: string | undefined;
    
    if (organization) {
      // Find the business linked to this organization
      const business = await db.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.externalAuthOrgId, organization.id),
      });
      
      if (business) {
        businessId = business.id;
        isBusinessUser = true;
        role = organization.role;
      }
    }
    
    return {
      user,
      organization,
      businessId,
      isPlatformAdmin,
      isBusinessUser,
      role,
    };
  } catch (error) {
    logger.error('Failed to get current Clerk session', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get the user's organization membership
 */
export async function getUserOrganization(userId: string): Promise<ClerkOrganization | null> {
  try {
    // Get the user's organization memberships
    const clerkUser = await clerkClient.users.getUser(userId);
    
    // Get the first active organization membership
    const organizationMembership = clerkUser.organization_memberships?.find(
      (membership: Record<string, unknown>) => 
        (membership as { status: string }).status === 'active'
    );
    
    if (!organizationMembership) {
      return null;
    }
    
    const organizationId = (organizationMembership as { organization: { id: string } }).organization.id;
    const organization = await clerkClient.organizations.getOrganization(organizationId);
    
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.created_at,
    };
  } catch (error) {
    logger.error('Failed to get user organization', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if a user is a platform admin
 */
export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  try {
    const platformAdmin = await db.query.platformAdmins.findFirst({
      where: (admins, { eq }) => eq(admins.externalAuthUserId, userId),
    });
    
    return platformAdmin !== undefined && platformAdmin.status === 'active';
  } catch (error) {
    logger.error('Failed to check if user is platform admin', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ============================================
// BUSINESS PROVISIONING
// ============================================

/**
 * Provision a new business for a user
 * This is called during onboarding when a user creates a new business
 */
export async function provisionBusiness(
  userId: string,
  organizationId: string,
  businessData: {
    name: string;
    slug: string;
    businessType?: string;
    timezone?: string;
    currency?: string;
    email?: string;
    phoneE164?: string;
  },
  context: RequestTenantContext
): Promise<schema.Business> {
  try {
    logger.info('Provisioning new business', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      userId: '***MASKED***' ,
      organizationId: '***MASKED***' ,
      businessName: businessData.name,
      businessSlug: businessData.slug,
    });
    
    // Check if business with this slug already exists
    const existingBusiness = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.slug, businessData.slug),
    });
    
    if (existingBusiness) {
      throw createError(ERROR_CODES.VALIDATION_FAILED, {
        requestId: context.requestId,
        correlationId: context.correlationId,
        message: `Business with slug '${businessData.slug}' already exists`,
        fieldErrors: [
          {
            field: 'slug',
            code: 'duplicate',
            message: 'Business slug must be unique',
          },
        ],
      });
    }
    
    // Create the business
    const [business] = await db.insert(schema.businesses).values({
      id: uuidv4(),
      externalAuthOrgId: organizationId,
      name: businessData.name,
      slug: businessData.slug,
      businessType: businessData.businessType || 'salon',
      timezone: businessData.timezone || 'Europe/London',
      currency: businessData.currency || 'GBP',
      locale: 'en-GB',
      email: businessData.email || '',
      phoneE164: businessData.phoneE164 || '',
      status: 'draft',
      bookingPagePublished: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    if (!business) {
      throw createError(ERROR_CODES.INTERNAL_ERROR, {
        requestId: context.requestId,
        correlationId: context.correlationId,
        message: 'Failed to create business',
      });
    }
    
    // Create the business user (owner)
    await db.insert(schema.businessUsers).values({
      id: uuidv4(),
      businessId: business.id,
      externalAuthUserId: userId,
      role: 'owner',
      status: 'active',
      email: businessData.email || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Create default booking policy
    await db.insert(schema.bookingPolicies).values({
      id: uuidv4(),
      businessId: business.id,
      version: 1,
      minimumNoticeMinutes: 60,
      bookingHorizonDays: 60,
      cancellationNoticeMinutes: 1440,
      reschedulingNoticeMinutes: 1440,
      isActive: true,
      effectiveFrom: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Create pilot entitlements
    const pilotEntitlements = [
      { featureKey: 'locations.max', value: '1', source: 'pilot', reason: 'Pilot business - single location' },
      { featureKey: 'staff_profiles.max', value: '10', source: 'pilot', reason: 'Pilot business - up to 10 staff' },
      { featureKey: 'services.max', value: '20', source: 'pilot', reason: 'Pilot business - up to 20 services' },
      { featureKey: 'bookings.monthly_max', value: '1000', source: 'pilot', reason: 'Pilot business - up to 1000 bookings/month' },
      { featureKey: 'email_notifications.enabled', value: 'true', source: 'pilot', reason: 'Email notifications enabled for pilot' },
    ];
    
    for (const entitlement of pilotEntitlements) {
      await db.insert(schema.entitlements).values({
        id: uuidv4(),
        businessId: business.id,
        featureKey: entitlement.featureKey,
        value: entitlement.value,
        source: entitlement.source,
        validFrom: new Date(),
        reason: entitlement.reason,
        actor: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Create audit event
    await db.insert(schema.auditEvents).values({
      id: uuidv4(),
      businessId: business.id,
      actorType: 'system',
      actorId: 'system',
      action: 'business.created',
      targetType: 'business',
      targetId: business.id,
      reason: 'Business provisioned during onboarding',
      correlationId: context.correlationId,
      createdAt: new Date(),
    });
    
    logger.info('Business provisioned successfully', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      businessId: business.id,
      businessName: business.name,
    });
    
    return business;
  } catch (error) {
    logger.error('Failed to provision business', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      userId: '***MASKED***' ,
      error: error instanceof Error ? error.message : String(error),
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError(ERROR_CODES.INTERNAL_ERROR, {
      requestId: context.requestId,
      correlationId: context.correlationId,
      message: 'Failed to provision business',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Link an existing business to a user
 * This is used when a user joins an existing business
 */
export async function linkUserToBusiness(
  userId: string,
  businessId: string,
  role: schema.businessUserRoleEnum.enumValues[number] = 'owner',
  context: RequestTenantContext
): Promise<schema.BusinessUser> {
  try {
    logger.info('Linking user to business', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      userId: '***MASKED***' ,
      businessId: '***MASKED***' ,
      role,
    });
    
    // Check if user is already linked to this business
    const existingLink = await db.query.businessUsers.findFirst({
      where: (users, { and, eq }) => and(
        eq(users.businessId, businessId),
        eq(users.externalAuthUserId, userId)
      ),
    });
    
    if (existingLink) {
      // Update existing link if role changed
      if (existingLink.role !== role) {
        const [updatedUser] = await db.update(schema.businessUsers)
          .set({ role, updatedAt: new Date() })
          .where(
            schema.and(
              schema.eq(schema.businessUsers.businessId, businessId),
              schema.eq(schema.businessUsers.externalAuthUserId, userId)
            )
          )
          .returning();
        
        return updatedUser;
      }
      
      return existingLink;
    }
    
    // Get user email from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.email_addresses?.[0]?.email_address || '';
    
    // Create the business user link
    const [businessUser] = await db.insert(schema.businessUsers).values({
      id: uuidv4(),
      businessId,
      externalAuthUserId: userId,
      role,
      status: 'active',
      email,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    if (!businessUser) {
      throw createError(ERROR_CODES.INTERNAL_ERROR, {
        requestId: context.requestId,
        correlationId: context.correlationId,
        message: 'Failed to link user to business',
      });
    }
    
    // Create audit event
    await db.insert(schema.auditEvents).values({
      id: uuidv4(),
      businessId,
      actorType: 'system',
      actorId: 'system',
      action: 'user.linked_to_business',
      targetType: 'business_user',
      targetId: businessUser.id,
      reason: `User ${userId} linked to business ${businessId} with role ${role}`,
      correlationId: context.correlationId,
      createdAt: new Date(),
    });
    
    logger.info('User linked to business successfully', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      businessUserId: businessUser.id,
      role,
    });
    
    return businessUser;
  } catch (error) {
    logger.error('Failed to link user to business', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      userId: '***MASKED***' ,
      businessId: '***MASKED***' ,
      error: error instanceof Error ? error.message : String(error),
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError(ERROR_CODES.INTERNAL_ERROR, {
      requestId: context.requestId,
      correlationId: context.correlationId,
      message: 'Failed to link user to business',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================
// ONBOARDING STATE MANAGEMENT
// ============================================

/**
 * Onboarding step types
 */
export type OnboardingStep = 
  | 'business_info'
  | 'location'
  | 'staff'
  | 'services'
  | 'availability'
  | 'policies'
  | 'publish';

/**
 * Onboarding state for a business
 */
export interface OnboardingState {
  businessId: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  isComplete: boolean;
  canPublish: boolean;
  missingRequirements: string[];
}

/**
 * Get the onboarding state for a business
 */
export async function getOnboardingState(businessId: string): Promise<OnboardingState> {
  try {
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.id, businessId),
    });
    
    if (!business) {
      throw createError(ERROR_CODES.BUSINESS_NOT_FOUND, {
        message: `Business ${businessId} not found`,
      });
    }
    
    // Check completed steps
    const completedSteps: OnboardingStep[] = [];
    const missingRequirements: string[] = [];
    
    // Step 1: Business info (always complete if business exists)
    completedSteps.push('business_info');
    
    // Step 2: Location
    const locationCount = await db.query.locations.count({
      where: (locations, { and, eq }) => and(
        eq(locations.businessId, businessId),
        eq(locations.isActive, true)
      ),
    });
    
    if (locationCount > 0) {
      completedSteps.push('location');
    } else {
      missingRequirements.push('At least one active location is required');
    }
    
    // Step 3: Staff
    const staffCount = await db.query.staffProfiles.count({
      where: (staff, { and, eq }) => and(
        eq(staff.businessId, businessId),
        eq(staff.isActive, true)
      ),
    });
    
    if (staffCount > 0) {
      completedSteps.push('staff');
    } else {
      missingRequirements.push('At least one active staff profile is required');
    }
    
    // Step 4: Services
    const serviceCount = await db.query.services.count({
      where: (services, { and, eq }) => and(
        eq(services.businessId, businessId),
        eq(services.isActive, true),
        eq(services.isPublic, true)
      ),
    });
    
    if (serviceCount > 0) {
      completedSteps.push('services');
    } else {
      missingRequirements.push('At least one active public service is required');
    }
    
    // Step 5: Availability
    const availabilityCount = await db.query.availabilityRules.count({
      where: (rules, { and, eq }) => and(
        eq(rules.businessId, businessId),
        eq(rules.isActive, true)
      ),
    });
    
    if (availabilityCount > 0) {
      completedSteps.push('availability');
    } else {
      missingRequirements.push('At least one availability rule is required');
    }
    
    // Step 6: Policies
    const policyCount = await db.query.bookingPolicies.count({
      where: (policies, { and, eq }) => and(
        eq(policies.businessId, businessId),
        eq(policies.isActive, true)
      ),
    });
    
    if (policyCount > 0) {
      completedSteps.push('policies');
    } else {
      missingRequirements.push('At least one active booking policy is required');
    }
    
    // Determine current step
    const allSteps: OnboardingStep[] = [
      'business_info',
      'location',
      'staff',
      'services',
      'availability',
      'policies',
      'publish',
    ];
    
    let currentStep: OnboardingStep = 'business_info';
    for (const step of allSteps) {
      if (!completedSteps.includes(step)) {
        currentStep = step;
        break;
      }
    }
    
    // Check if all requirements are met for publishing
    const canPublish = business.bookingPagePublished === false && 
                      missingRequirements.length === 0 &&
                      completedSteps.includes('policies');
    
    const isComplete = business.bookingPagePublished === true;
    
    return {
      businessId,
      currentStep,
      completedSteps,
      isComplete,
      canPublish,
      missingRequirements,
    };
  } catch (error) {
    logger.error('Failed to get onboarding state', {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError(ERROR_CODES.INTERNAL_ERROR, {
      message: 'Failed to get onboarding state',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Check if a business meets all publish requirements
 */
export async function checkPublishRequirements(businessId: string): Promise<{
  canPublish: boolean;
  missingRequirements: string[];
}> {
  try {
    const state = await getOnboardingState(businessId);
    return {
      canPublish: state.canPublish,
      missingRequirements: state.missingRequirements,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError(ERROR_CODES.INTERNAL_ERROR, {
      message: 'Failed to check publish requirements',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Publish a business (make it available for public bookings)
 */
export async function publishBusiness(
  businessId: string,
  userId: string,
  context: RequestTenantContext
): Promise<schema.Business> {
  try {
    logger.info('Publishing business', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      businessId: '***MASKED***' ,
      userId: '***MASKED***' ,
    });
    
    // Check publish requirements
    const { canPublish, missingRequirements } = await checkPublishRequirements(businessId);
    
    if (!canPublish) {
      throw createError(ERROR_CODES.VALIDATION_FAILED, {
        requestId: context.requestId,
        correlationId: context.correlationId,
        message: 'Business does not meet all publish requirements',
        fieldErrors: missingRequirements.map(req => ({
          field: 'publish',
          code: 'missing_requirement',
          message: req,
        })),
      });
    }
    
    // Update business status
    const [business] = await db.update(schema.businesses)
      .set({
        status: 'active',
        bookingPagePublished: true,
        updatedAt: new Date(),
      })
      .where(schema.eq(schema.businesses.id, businessId))
      .returning();
    
    if (!business) {
      throw createError(ERROR_CODES.BUSINESS_NOT_FOUND, {
        requestId: context.requestId,
        correlationId: context.correlationId,
        message: `Business ${businessId} not found`,
      });
    }
    
    // Create audit event
    await db.insert(schema.auditEvents).values({
      id: uuidv4(),
      businessId,
      actorType: 'business_user',
      actorId: userId,
      action: 'business.published',
      targetType: 'business',
      targetId: business.id,
      reason: 'Business published and made available for public bookings',
      correlationId: context.correlationId,
      createdAt: new Date(),
    });
    
    logger.info('Business published successfully', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      businessId: business.id,
      businessName: business.name,
    });
    
    return business;
  } catch (error) {
    logger.error('Failed to publish business', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      businessId: '***MASKED***' ,
      userId: '***MASKED***' ,
      error: error instanceof Error ? error.message : String(error),
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError(ERROR_CODES.INTERNAL_ERROR, {
      requestId: context.requestId,
      correlationId: context.correlationId,
      message: 'Failed to publish business',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Unpublish a business (make it unavailable for public bookings)
 */
export async function unpublishBusiness(
  businessId: string,
  userId: string,
  context: RequestTenantContext
): Promise<schema.Business> {
  try {
    logger.info('Unpublishing business', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      businessId: '***MASKED***' ,
      userId: '***MASKED***' ,
    });
    
    // Update business status
    const [business] = await db.update(schema.businesses)
      .set({
        bookingPagePublished: false,
        updatedAt: new Date(),
      })
      .where(schema.eq(schema.businesses.id, businessId))
      .returning();
    
    if (!business) {
      throw createError(ERROR_CODES.BUSINESS_NOT_FOUND, {
        requestId: context.requestId,
        correlationId: context.correlationId,
        message: `Business ${businessId} not found`,
      });
    }
    
    // Create audit event
    await db.insert(schema.auditEvents).values({
      id: uuidv4(),
      businessId,
      actorType: 'business_user',
      actorId: userId,
      action: 'business.unpublished',
      targetType: 'business',
      targetId: business.id,
      reason: 'Business unpublished and made unavailable for public bookings',
      correlationId: context.correlationId,
      createdAt: new Date(),
    });
    
    logger.info('Business unpublished successfully', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      businessId: business.id,
      businessName: business.name,
    });
    
    return business;
  } catch (error) {
    logger.error('Failed to unpublish business', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      businessId: '***MASKED***' ,
      userId: '***MASKED***' ,
      error: error instanceof Error ? error.message : String(error),
    });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw createError(ERROR_CODES.INTERNAL_ERROR, {
      requestId: context.requestId,
      correlationId: context.correlationId,
      message: 'Failed to unpublish business',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================
// WEBHOOK HANDLERS
// ============================================

/**
 * Handle Clerk webhook events
 * This processes user and organization events from Clerk
 */
export async function handleClerkWebhook(
  event: ClerkWebhookPayload,
  rawBody: string,
  signature: string
): Promise<void> {
  try {
    const startTime = Date.now();
    const requestId = generateRequestId();
    const correlationId = generateCorrelationId();
    
    logger.info('Processing Clerk webhook', {
      requestId,
      correlationId,
      eventType: event.type,
      eventId: event.id,
    });
    
    // Verify webhook signature (in production)
    if (process.env.NODE_ENV === 'production') {
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', process.env.CLERK_WEBHOOK_SECRET || '');
      const expectedSignature = `v1,${hmac.update(rawBody).digest('hex')}`;
      
      if (signature !== expectedSignature) {
        throw createError(ERROR_CODES.FORBIDDEN, {
          requestId,
          correlationId,
          message: 'Invalid webhook signature',
        });
      }
    }
    
    // Record the webhook event
    await db.insert(schema.webhookEvents).values({
      id: uuidv4(),
      provider: 'clerk',
      providerEventId: event.id,
      eventType: event.type,
      payloadHash: require('crypto').createHash('sha256').update(JSON.stringify(event.data)).digest('hex'),
      processingStatus: 'processing',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Process the event based on type
    switch (event.type) {
      case 'user.created':
        await handleUserCreated(event, requestId, correlationId);
        break;
      
      case 'user.updated':
        await handleUserUpdated(event, requestId, correlationId);
        break;
      
      case 'user.deleted':
        await handleUserDeleted(event, requestId, correlationId);
        break;
      
      case 'organization.created':
        await handleOrganizationCreated(event, requestId, correlationId);
        break;
      
      case 'organization.updated':
        await handleOrganizationUpdated(event, requestId, correlationId);
        break;
      
      case 'organization.deleted':
        await handleOrganizationDeleted(event, requestId, correlationId);
        break;
      
      case 'organizationMembership.created':
        await handleOrganizationMembershipCreated(event, requestId, correlationId);
        break;
      
      case 'organizationMembership.updated':
        await handleOrganizationMembershipUpdated(event, requestId, correlationId);
        break;
      
      case 'organizationMembership.deleted':
        await handleOrganizationMembershipDeleted(event, requestId, correlationId);
        break;
      
      default:
        logger.warn('Unknown Clerk webhook event type', {
          requestId,
          correlationId,
          eventType: event.type,
        });
    }
    
    // Update webhook event as processed
    await db.update(schema.webhookEvents)
      .set({
        processingStatus: 'processed',
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        schema.and(
          schema.eq(schema.webhookEvents.provider, 'clerk'),
          schema.eq(schema.webhookEvents.providerEventId, event.id)
        )
      );
    
    logger.info('Clerk webhook processed successfully', {
      requestId,
      correlationId,
      eventType: event.type,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('Failed to process Clerk webhook', {
      requestId: generateRequestId(),
      correlationId: generateCorrelationId(),
      eventType: event.type,
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Update webhook event as failed
    await db.update(schema.webhookEvents)
      .set({
        processingStatus: 'failed',
        failureReason: error instanceof Error ? error.message : String(error),
        failureCount: schema.sql`failure_count + 1`,
        updatedAt: new Date(),
      })
      .where(
        schema.and(
          schema.eq(schema.webhookEvents.provider, 'clerk'),
          schema.eq(schema.webhookEvents.providerEventId, event.id)
        )
      );
    
    throw error;
  }
}

/**
 * Handle user.created webhook
 */
async function handleUserCreated(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const userData = event.data as { 
      id: string;
      email_addresses: { email_address: string }[];
      first_name?: string;
      last_name?: string;
      username?: string;
      image_url?: string;
    };
    
    logger.info('Handling user.created webhook', {
      requestId,
      correlationId,
      userId: userData.id,
    });
    
    // User is created in Clerk, but we don't create business user until they join an organization
    // This is handled during onboarding or when they're invited to a business
    
    logger.info('User created in Clerk, awaiting organization membership', {
      requestId,
      correlationId,
      userId: userData.id,
    });
  } catch (error) {
    logger.error('Failed to handle user.created webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle user.updated webhook
 */
async function handleUserUpdated(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const userData = event.data as { 
      id: string;
      email_addresses: { email_address: string }[];
      first_name?: string;
      last_name?: string;
      username?: string;
      image_url?: string;
    };
    
    logger.info('Handling user.updated webhook', {
      requestId,
      correlationId,
      userId: userData.id,
    });
    
    // Update business users with new email if changed
    const email = userData.email_addresses?.[0]?.email_address;
    if (email) {
      await db.update(schema.businessUsers)
        .set({ email, updatedAt: new Date() })
        .where(schema.eq(schema.businessUsers.externalAuthUserId, userData.id));
    }
    
    logger.info('User updated in database', {
      requestId,
      correlationId,
      userId: userData.id,
    });
  } catch (error) {
    logger.error('Failed to handle user.updated webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle user.deleted webhook
 */
async function handleUserDeleted(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const userData = event.data as { id: string };
    
    logger.info('Handling user.deleted webhook', {
      requestId,
      correlationId,
      userId: userData.id,
    });
    
    // Soft delete business user (don't actually delete to preserve history)
    await db.update(schema.businessUsers)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(schema.eq(schema.businessUsers.externalAuthUserId, userData.id));
    
    // Create audit event
    await db.insert(schema.auditEvents).values({
      id: uuidv4(),
      actorType: 'system',
      actorId: 'clerk-webhook',
      action: 'user.deleted',
      targetType: 'business_user',
      targetId: userData.id,
      reason: 'User deleted in Clerk',
      correlationId,
      createdAt: new Date(),
    });
    
    logger.info('User deleted from database', {
      requestId,
      correlationId,
      userId: userData.id,
    });
  } catch (error) {
    logger.error('Failed to handle user.deleted webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle organization.created webhook
 */
async function handleOrganizationCreated(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const orgData = event.data as { 
      id: string;
      name: string;
      slug: string;
      created_at: string;
    };
    
    logger.info('Handling organization.created webhook', {
      requestId,
      correlationId,
      organizationId: orgData.id,
      organizationName: orgData.name,
    });
    
    // Check if this organization is already linked to a business
    const existingBusiness = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.externalAuthOrgId, orgData.id),
    });
    
    if (existingBusiness) {
      logger.info('Organization already linked to business', {
        requestId,
        correlationId,
        organizationId: orgData.id,
        businessId: existingBusiness.id,
      });
      return;
    }
    
    // Organization created but not yet linked to a business
    // This will be handled during onboarding
    
    logger.info('Organization created in Clerk, awaiting business provisioning', {
      requestId,
      correlationId,
      organizationId: orgData.id,
    });
  } catch (error) {
    logger.error('Failed to handle organization.created webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle organization.updated webhook
 */
async function handleOrganizationUpdated(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const orgData = event.data as { 
      id: string;
      name: string;
      slug: string;
    };
    
    logger.info('Handling organization.updated webhook', {
      requestId,
      correlationId,
      organizationId: orgData.id,
    });
    
    // Update the business linked to this organization
    await db.update(schema.businesses)
      .set({ 
        name: orgData.name,
        updatedAt: new Date() 
      })
      .where(schema.eq(schema.businesses.externalAuthOrgId, orgData.id));
    
    logger.info('Organization updated in database', {
      requestId,
      correlationId,
      organizationId: orgData.id,
    });
  } catch (error) {
    logger.error('Failed to handle organization.updated webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle organization.deleted webhook
 */
async function handleOrganizationDeleted(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const orgData = event.data as { id: string };
    
    logger.info('Handling organization.deleted webhook', {
      requestId,
      correlationId,
      organizationId: orgData.id,
    });
    
    // Find and suspend the business linked to this organization
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.externalAuthOrgId, orgData.id),
    });
    
    if (business) {
      await db.update(schema.businesses)
        .set({ 
          status: 'suspended',
          bookingPagePublished: false,
          updatedAt: new Date() 
        })
        .where(schema.eq(schema.businesses.id, business.id));
      
      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId: business.id,
        actorType: 'system',
        actorId: 'clerk-webhook',
        action: 'business.suspended',
        targetType: 'business',
        targetId: business.id,
        reason: 'Organization deleted in Clerk',
        correlationId,
        createdAt: new Date(),
      });
    }
    
    logger.info('Organization deleted from database', {
      requestId,
      correlationId,
      organizationId: orgData.id,
    });
  } catch (error) {
    logger.error('Failed to handle organization.deleted webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle organizationMembership.created webhook
 */
async function handleOrganizationMembershipCreated(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const membershipData = event.data as { 
      id: string;
      organization: { id: string };
      user: { id: string };
      role: string;
    };
    
    logger.info('Handling organizationMembership.created webhook', {
      requestId,
      correlationId,
      membershipId: membershipData.id,
      organizationId: membershipData.organization.id,
      userId: membershipData.user.id,
      role: membershipData.role,
    });
    
    // Find the business linked to this organization
    const business = await db.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.externalAuthOrgId, membershipData.organization.id),
    });
    
    if (business) {
      // Link the user to the business
      await linkUserToBusiness(
        membershipData.user.id,
        business.id,
        membershipData.role as schema.businessUserRoleEnum.enumValues[number],
        { ...context, requestId, correlationId }
      );
    } else {
      logger.warn('Organization membership created but no linked business found', {
        requestId,
        correlationId,
        organizationId: membershipData.organization.id,
      });
    }
  } catch (error) {
    logger.error('Failed to handle organizationMembership.created webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle organizationMembership.updated webhook
 */
async function handleOrganizationMembershipUpdated(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const membershipData = event.data as { 
      id: string;
      organization: { id: string };
      user: { id: string };
      role: string;
    };
    
    logger.info('Handling organizationMembership.updated webhook', {
      requestId,
      correlationId,
      membershipId: membershipData.id,
      userId: membershipData.user.id,
      role: membershipData.role,
    });
    
    // Update the business user role
    await db.update(schema.businessUsers)
      .set({ 
        role: membershipData.role as schema.businessUserRoleEnum.enumValues[number],
        updatedAt: new Date() 
      })
      .where(schema.eq(schema.businessUsers.externalAuthUserId, membershipData.user.id));
    
    logger.info('Organization membership updated in database', {
      requestId,
      correlationId,
      userId: membershipData.user.id,
    });
  } catch (error) {
    logger.error('Failed to handle organizationMembership.updated webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle organizationMembership.deleted webhook
 */
async function handleOrganizationMembershipDeleted(
  event: ClerkWebhookPayload,
  requestId: string,
  correlationId: string
): Promise<void> {
  try {
    const membershipData = event.data as { 
      id: string;
      organization: { id: string };
      user: { id: string };
    };
    
    logger.info('Handling organizationMembership.deleted webhook', {
      requestId,
      correlationId,
      membershipId: membershipData.id,
      userId: membershipData.user.id,
    });
    
    // Disable the business user
    await db.update(schema.businessUsers)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(schema.eq(schema.businessUsers.externalAuthUserId, membershipData.user.id));
    
    // Create audit event
    await db.insert(schema.auditEvents).values({
      id: uuidv4(),
      actorType: 'system',
      actorId: 'clerk-webhook',
      action: 'user.unlinked_from_business',
      targetType: 'business_user',
      targetId: membershipData.user.id,
      reason: 'Organization membership deleted in Clerk',
      correlationId,
      createdAt: new Date(),
    });
    
    logger.info('Organization membership deleted from database', {
      requestId,
      correlationId,
      userId: membershipData.user.id,
    });
  } catch (error) {
    logger.error('Failed to handle organizationMembership.deleted webhook', {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Clerk authentication middleware for Next.js
 * This middleware handles Clerk session verification and tenant context setup
 */
export async function clerkMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const startTime = Date.now();
  const path = request.nextUrl.pathname;
  const method = request.method;
  
  // Skip Clerk middleware for health checks and public assets
  if (path.startsWith('/api/v1/health') || 
      path.startsWith('/favicon.ico') ||
      path.startsWith('/public/')) {
    return null;
  }
  
  try {
    // Get Clerk session
    const session = await getCurrentSession(request);
    
    if (!session) {
      // No session, continue (public endpoints will handle authorization)
      return null;
    }
    
    // Set tenant context on request
    const requestId = generateRequestId();
    const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
    
    const tenantContext: RequestTenantContext = {
      requestId,
      correlationId,
      businessId: session.businessId,
      userId: session.user.id,
      isPlatformAdmin: session.isPlatformAdmin,
      isBusinessUser: session.isBusinessUser,
      ipAddress: request.ip,
      userAgent: request.headers.get('user-agent'),
      path,
      method,
    };
    
    setTenantContextOnRequest(request, tenantContext);
    
    logger.info('Clerk session established', {
      requestId,
      correlationId,
      path,
      method,
      userId: '***MASKED***' ,
      businessId: session.businessId ? '***MASKED***' : undefined,
      isPlatformAdmin: session.isPlatformAdmin,
      isBusinessUser: session.isBusinessUser,
      durationMs: Date.now() - startTime,
    });
    
    return null; // Continue to next middleware/handler
    
  } catch (error) {
    logger.error('Clerk middleware error', {
      path,
      method,
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Return error response for authentication failures
    if (error instanceof AuthenticationError) {
      return NextResponse.json(error.toApiResponse(), {
        status: error.statusCode,
        headers: {
          'X-Request-ID': generateRequestId(),
          'X-Correlation-ID': generateCorrelationId(),
        },
      });
    }
    
    // For other errors, continue and let downstream middleware handle it
    return null;
  }
}

/**
 * Require Clerk authentication middleware
 * This ensures the user is authenticated
 */
export async function requireClerkAuth(request: NextRequest): Promise<NextResponse | null> {
  const session = await getCurrentSession(request);
  
  if (!session) {
    const context = getTenantContext(request);
    const error = new AuthenticationError({
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
 * Require business user authentication middleware
 * This ensures the user is authenticated and has a business
 */
export async function requireBusinessUser(request: NextRequest): Promise<NextResponse | null> {
  const session = await getCurrentSession(request);
  
  if (!session || !session.isBusinessUser || !session.businessId) {
    const context = getTenantContext(request);
    const error = new AuthorizationError({
      requestId: context?.requestId,
      correlationId: context?.correlationId,
      message: 'Business user authentication is required',
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
 * Require platform admin authentication middleware
 * This ensures the user is a platform admin
 */
export async function requirePlatformAdmin(request: NextRequest): Promise<NextResponse | null> {
  const session = await getCurrentSession(request);
  
  if (!session || !session.isPlatformAdmin) {
    const context = getTenantContext(request);
    const error = new AuthorizationError({
      requestId: context?.requestId,
      correlationId: context?.correlationId,
      message: 'Platform admin authentication is required',
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
  CLERK_API_VERSION,
  SESSION_CACHE_TTL,
  getCurrentUser,
  getCurrentSession,
  getUserOrganization,
  isPlatformAdminUser,
  provisionBusiness,
  linkUserToBusiness,
  getOnboardingState,
  checkPublishRequirements,
  publishBusiness,
  unpublishBusiness,
  handleClerkWebhook,
  clerkMiddleware,
  requireClerkAuth,
  requireBusinessUser,
  requirePlatformAdmin,
};

export type {
  ClerkSession,
  ClerkWebhookEventType,
  ClerkWebhookPayload,
  OnboardingStep,
  OnboardingState,
};
