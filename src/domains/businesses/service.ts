/**
 * Business Domain Service
 * 
 * This service provides business-related operations as specified in PRD Section UC-002.
 * It handles business settings management, onboarding state, and publish requirements.
 */

import { db } from '../../infrastructure/db/client';
import * as schema from '../../infrastructure/db/schema';
import { logger } from '../../infrastructure/observability/logger';
import { 
  AppError, 
  ERROR_CODES, 
  createError,
  NotFoundError,
  ValidationError,
  AuthorizationError
} from '../../shared/errors/types';
import { 
  updateBusinessSchema,
  businessSettingsSchema,
  validate 
} from '../../shared/validation/schemas';
import { 
  getTenantContext,
  RequestTenantContext
} from '../../infrastructure/auth/tenant-context';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// TYPES
// ============================================

/**
 * Business with statistics
 */
export interface BusinessWithStats extends schema.Business {
  locationCount: number;
  staffCount: number;
  serviceCount: number;
  bookingCount: number;
}

/**
 * Business settings update
 */
export interface BusinessSettingsUpdate {
  bookingPagePublished?: boolean;
  bookingHorizonDays?: number;
  minimumNoticeMinutes?: number;
  cancellationNoticeMinutes?: number;
  slotIncrementMinutes?: number;
}

/**
 * Business update
 */
export interface BusinessUpdate {
  name?: string;
  slug?: string;
  businessType?: string;
  timezone?: string;
  currency?: string;
  locale?: string;
  email?: string;
  phoneE164?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

// ============================================
// BUSINESS SERVICE
// ============================================

/**
 * Business Service
 * Provides business-related operations
 */
export class BusinessService {
  private context: RequestTenantContext;

  constructor(context: RequestTenantContext) {
    this.context = context;
  }

  /**
   * Get business by ID
   */
  async getBusiness(businessId: string): Promise<schema.Business> {
    try {
      const business = await db.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.id, businessId),
      });

      if (!business) {
        throw new NotFoundError('Business', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      return business;
    } catch (error) {
      logger.error('Failed to get business', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get business with statistics
   */
  async getBusinessWithStats(businessId: string): Promise<BusinessWithStats> {
    try {
      const business = await this.getBusiness(businessId);

      // Get counts
      const [locationCount, staffCount, serviceCount, bookingCount] = await Promise.all([
        db.query.locations.count({
          where: (locations, { eq }) => eq(locations.businessId, businessId),
        }),
        db.query.staffProfiles.count({
          where: (staff, { eq }) => eq(staff.businessId, businessId),
        }),
        db.query.services.count({
          where: (services, { eq }) => eq(services.businessId, businessId),
        }),
        db.query.bookings.count({
          where: (bookings, { eq }) => eq(bookings.businessId, businessId),
        }),
      ]);

      return {
        ...business,
        locationCount,
        staffCount,
        serviceCount,
        bookingCount,
      };
    } catch (error) {
      logger.error('Failed to get business with stats', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update business settings
   */
  async updateBusiness(
    businessId: string,
    updateData: BusinessUpdate
  ): Promise<schema.Business> {
    try {
      // Validate the update data
      const validatedData = validate(updateBusinessSchema, updateData);

      // Check if business exists
      const existingBusiness = await this.getBusiness(businessId);

      // Check if slug is being changed and if it's available
      if (validatedData.slug && validatedData.slug !== existingBusiness.slug) {
        const businessWithSlug = await db.query.businesses.findFirst({
          where: (businesses, { eq }) => eq(businesses.slug, validatedData.slug),
        });

        if (businessWithSlug) {
          throw new ValidationError({
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
            fieldErrors: [
              {
                field: 'slug',
                code: 'duplicate',
                message: `Business with slug '${validatedData.slug}' already exists`,
              },
            ],
          });
        }
      }

      // Build update object
      const update: Partial<schema.Business> = {
        name: validatedData.name,
        slug: validatedData.slug,
        businessType: validatedData.businessType,
        timezone: validatedData.timezone,
        currency: validatedData.currency,
        locale: validatedData.locale,
        email: validatedData.email,
        phoneE164: validatedData.phoneE164,
        logoUrl: validatedData.logoUrl,
        primaryColor: validatedData.primaryColor,
        accentColor: validatedData.accentColor,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(update).forEach(key => {
        if (update[key as keyof schema.Business] === undefined) {
          delete update[key as keyof schema.Business];
        }
      });

      // Update the business
      const [updatedBusiness] = await db.update(schema.businesses)
        .set(update)
        .where(eq(schema.businesses.id, businessId))
        .returning();

      if (!updatedBusiness) {
        throw new NotFoundError('Business', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'business.updated',
        targetType: 'business',
        targetId: businessId,
        reason: 'Business settings updated',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Business updated successfully', {
        ...this.context,
        businessId: '***MASKED***' ,
      });

      return updatedBusiness;
    } catch (error) {
      logger.error('Failed to update business', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update business settings
   */
  async updateBusinessSettings(
    businessId: string,
    settings: BusinessSettingsUpdate
  ): Promise<schema.Business> {
    try {
      // Validate the settings
      const validatedSettings = validate(businessSettingsSchema, settings);

      // Check if business exists
      await this.getBusiness(businessId);

      // Build update object
      const update: Partial<schema.Business> = {
        bookingPagePublished: validatedSettings.bookingPagePublished,
        bookingHorizonDays: validatedSettings.bookingHorizonDays,
        minimumNoticeMinutes: validatedSettings.minimumNoticeMinutes,
        cancellationNoticeMinutes: validatedSettings.cancellationNoticeMinutes,
        slotIncrementMinutes: validatedSettings.slotIncrementMinutes,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(update).forEach(key => {
        if (update[key as keyof schema.Business] === undefined) {
          delete update[key as keyof schema.Business];
        }
      });

      // Update the business
      const [updatedBusiness] = await db.update(schema.businesses)
        .set(update)
        .where(eq(schema.businesses.id, businessId))
        .returning();

      if (!updatedBusiness) {
        throw new NotFoundError('Business', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'business.settings_updated',
        targetType: 'business',
        targetId: businessId,
        reason: 'Business settings updated',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Business settings updated successfully', {
        ...this.context,
        businessId: '***MASKED***' ,
      });

      return updatedBusiness;
    } catch (error) {
      logger.error('Failed to update business settings', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Publish business
   */
  async publishBusiness(businessId: string): Promise<schema.Business> {
    try {
      // Check publish requirements
      const { canPublish, missingRequirements } = await this.checkPublishRequirements(businessId);

      if (!canPublish) {
        throw new ValidationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Business does not meet all publish requirements',
          fieldErrors: missingRequirements.map(req => ({
            field: 'publish',
            code: 'missing_requirement',
            message: req,
          })),
        });
      }

      // Update business status
      const [updatedBusiness] = await db.update(schema.businesses)
        .set({
          status: 'active',
          bookingPagePublished: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.businesses.id, businessId))
        .returning();

      if (!updatedBusiness) {
        throw new NotFoundError('Business', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'business.published',
        targetType: 'business',
        targetId: businessId,
        reason: 'Business published and made available for public bookings',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Business published successfully', {
        ...this.context,
        businessId: '***MASKED***' ,
      });

      return updatedBusiness;
    } catch (error) {
      logger.error('Failed to publish business', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Unpublish business
   */
  async unpublishBusiness(businessId: string): Promise<schema.Business> {
    try {
      // Update business status
      const [updatedBusiness] = await db.update(schema.businesses)
        .set({
          bookingPagePublished: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.businesses.id, businessId))
        .returning();

      if (!updatedBusiness) {
        throw new NotFoundError('Business', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'business.unpublished',
        targetType: 'business',
        targetId: businessId,
        reason: 'Business unpublished and made unavailable for public bookings',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Business unpublished successfully', {
        ...this.context,
        businessId: '***MASKED***' ,
      });

      return updatedBusiness;
    } catch (error) {
      logger.error('Failed to unpublish business', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check publish requirements
   */
  async checkPublishRequirements(businessId: string): Promise<{
    canPublish: boolean;
    missingRequirements: string[];
  }> {
    try {
      const business = await this.getBusiness(businessId);

      if (business.bookingPagePublished) {
        return { canPublish: false, missingRequirements: ['Business is already published'] };
      }

      const missingRequirements: string[] = [];

      // Check business name
      if (!business.name || business.name.trim() === '') {
        missingRequirements.push('Business name is required');
      }

      // Check slug
      if (!business.slug || business.slug.trim() === '') {
        missingRequirements.push('Business slug is required');
      }

      // Check timezone
      if (!business.timezone || business.timezone.trim() === '') {
        missingRequirements.push('Business timezone is required');
      }

      // Check email
      if (!business.email || business.email.trim() === '') {
        missingRequirements.push('Business email is required');
      }

      // Check phone
      if (!business.phoneE164 || business.phoneE164.trim() === '') {
        missingRequirements.push('Business phone number is required');
      }

      // Check for at least one active location
      const locationCount = await db.query.locations.count({
        where: (locations, { and, eq }) => and(
          eq(locations.businessId, businessId),
          eq(locations.isActive, true)
        ),
      });

      if (locationCount === 0) {
        missingRequirements.push('At least one active location is required');
      }

      // Check for at least one active staff profile
      const staffCount = await db.query.staffProfiles.count({
        where: (staff, { and, eq }) => and(
          eq(staff.businessId, businessId),
          eq(staff.isActive, true)
        ),
      });

      if (staffCount === 0) {
        missingRequirements.push('At least one active staff profile is required');
      }

      // Check for at least one active public service
      const serviceCount = await db.query.services.count({
        where: (services, { and, eq }) => and(
          eq(services.businessId, businessId),
          eq(services.isActive, true),
          eq(services.isPublic, true)
        ),
      });

      if (serviceCount === 0) {
        missingRequirements.push('At least one active public service is required');
      }

      // Check for at least one availability rule
      const availabilityCount = await db.query.availabilityRules.count({
        where: (rules, { and, eq }) => and(
          eq(rules.businessId, businessId),
          eq(rules.isActive, true)
        ),
      });

      if (availabilityCount === 0) {
        missingRequirements.push('At least one availability rule is required');
      }

      // Check for active booking policy
      const policyCount = await db.query.bookingPolicies.count({
        where: (policies, { and, eq }) => and(
          eq(policies.businessId, businessId),
          eq(policies.isActive, true)
        ),
      });

      if (policyCount === 0) {
        missingRequirements.push('At least one active booking policy is required');
      }

      const canPublish = missingRequirements.length === 0;

      return { canPublish, missingRequirements };
    } catch (error) {
      logger.error('Failed to check publish requirements', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get onboarding state
   */
  async getOnboardingState(businessId: string): Promise<{
    businessId: string;
    currentStep: string;
    completedSteps: string[];
    isComplete: boolean;
    canPublish: boolean;
    missingRequirements: string[];
  }> {
    try {
      const business = await this.getBusiness(businessId);

      const completedSteps: string[] = ['business_info'];
      const missingRequirements: string[] = [];

      // Check location
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

      // Check staff
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

      // Check services
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

      // Check availability
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

      // Check policies
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
      const allSteps = ['business_info', 'location', 'staff', 'services', 'availability', 'policies', 'publish'];
      let currentStep = 'business_info';

      for (const step of allSteps) {
        if (!completedSteps.includes(step)) {
          currentStep = step;
          break;
        }
      }

      // Check if all requirements are met for publishing
      const { canPublish } = await this.checkPublishRequirements(businessId);

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
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a business service instance
 */
export function createBusinessService(context: RequestTenantContext): BusinessService {
  return new BusinessService(context);
}

// Re-export types
export type { BusinessWithStats, BusinessSettingsUpdate, BusinessUpdate };

// Import sql helpers
import { eq, and } from 'drizzle-orm';
