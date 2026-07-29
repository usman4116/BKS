/**
 * Locations Domain Service
 * 
 * This service provides location-related operations as specified in PRD Section UC-003.
 * It handles location creation, updating, deletion, and listing for businesses.
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
  createLocationSchema,
  updateLocationSchema,
  addressSchema,
  validate 
} from '../../shared/validation/schemas';
import { 
  getTenantContext,
  RequestTenantContext
} from '../../infrastructure/auth/tenant-context';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, asc } from 'drizzle-orm';

// ============================================
// TYPES
// ============================================

/**
 * Location with full details
 */
export interface LocationWithDetails extends schema.Location {
  staffCount: number;
  serviceCount: number;
  isPrimary: boolean;
}

/**
 * Create location request
 */
export interface CreateLocationRequest {
  name: string;
  address?: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    region?: string;
    postalCode?: string;
    countryCode: string;
  };
  phoneE164?: string;
  timezoneOverride?: string;
  latitude?: string;
  longitude?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  isVirtual?: boolean;
  publicInstructions?: string;
  displayOrder?: number;
}

/**
 * Update location request
 */
export interface UpdateLocationRequest {
  name?: string;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    countryCode?: string;
  };
  phoneE164?: string;
  timezoneOverride?: string;
  latitude?: string;
  longitude?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  isVirtual?: boolean;
  publicInstructions?: string;
  displayOrder?: number;
}

/**
 * Location list options
 */
export interface LocationListOptions {
  includeInactive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'displayOrder' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Location list result
 */
export interface LocationListResult {
  locations: schema.Location[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

// ============================================
// LOCATIONS SERVICE
// ============================================

/**
 * Locations Service
 * Provides location-related operations
 */
export class LocationsService {
  private context: RequestTenantContext;

  constructor(context: RequestTenantContext) {
    this.context = context;
  }

  /**
   * Get location by ID
   */
  async getLocation(locationId: string): Promise<schema.Location> {
    try {
      const location = await db.query.locations.findFirst({
        where: (locations, { eq }) => eq(locations.id, locationId),
      });

      if (!location) {
        throw new NotFoundError('Location', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      return location;
    } catch (error) {
      logger.error('Failed to get location', {
        ...this.context,
        locationId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get location with details
   */
  async getLocationWithDetails(locationId: string): Promise<LocationWithDetails> {
    try {
      const location = await this.getLocation(locationId);

      // Get counts
      const [staffCount, serviceCount] = await Promise.all([
        db.query.staffProfiles.count({
          where: (staff, { eq }) => eq(staff.locationId, locationId),
        }),
        db.query.services.count({
          where: (services, { eq }) => eq(services.locationId, locationId),
        }),
      ]);

      return {
        ...location,
        staffCount,
        serviceCount,
      };
    } catch (error) {
      logger.error('Failed to get location with details', {
        ...this.context,
        locationId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * List locations for a business
   */
  async listLocations(
    businessId: string,
    options: LocationListOptions = {}
  ): Promise<LocationListResult> {
    try {
      const {
        includeInactive = false,
        page = 1,
        limit = 20,
        sortBy = 'displayOrder',
        sortOrder = 'asc',
      } = options;

      // Build where clause
      const whereClause = and(
        eq(schema.locations.businessId, businessId),
        includeInactive ? undefined : eq(schema.locations.isActive, true)
      );

      // Build order by clause
      let orderByClause;
      switch (sortBy) {
        case 'name':
          orderByClause = sortOrder === 'desc' ? desc(schema.locations.name) : asc(schema.locations.name);
          break;
        case 'createdAt':
          orderByClause = sortOrder === 'desc' ? desc(schema.locations.createdAt) : asc(schema.locations.createdAt);
          break;
        case 'displayOrder':
        default:
          orderByClause = sortOrder === 'desc' ? desc(schema.locations.displayOrder) : asc(schema.locations.displayOrder);
          break;
      }

      // Get locations
      const locations = await db.query.locations.findMany({
        where: whereClause,
        orderBy: [orderByClause],
        limit,
        offset: (page - 1) * limit,
      });

      // Get total count
      const total = await db.query.locations.count({
        where: and(
          eq(schema.locations.businessId, businessId),
          includeInactive ? undefined : eq(schema.locations.isActive, true)
        ),
      });

      const totalPages = Math.ceil(total / limit);
      const hasMore = page < totalPages;

      return {
        locations,
        total,
        page,
        limit,
        totalPages,
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to list locations', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new location
   */
  async createLocation(
    businessId: string,
    locationData: CreateLocationRequest
  ): Promise<schema.Location> {
    try {
      // Validate the location data
      const validatedData = validate(createLocationSchema, locationData);

      // Check if this would be the primary location
      if (validatedData.isPrimary) {
        // Check if there's already a primary location
        const existingPrimary = await db.query.locations.findFirst({
          where: (locations, { and, eq }) => and(
            eq(locations.businessId, businessId),
            eq(locations.isPrimary, true)
          ),
        });

        if (existingPrimary) {
          // Unset the existing primary location
          await db.update(schema.locations)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(eq(schema.locations.id, existingPrimary.id));
        }
      }

      // Create the location
      const [location] = await db.insert(schema.locations).values({
        id: uuidv4(),
        businessId,
        name: validatedData.name,
        addressLine1: validatedData.address?.addressLine1,
        addressLine2: validatedData.address?.addressLine2,
        city: validatedData.address?.city,
        region: validatedData.address?.region,
        postalCode: validatedData.address?.postalCode,
        countryCode: validatedData.address?.countryCode || 'GB',
        timezoneOverride: validatedData.timezoneOverride,
        phoneE164: validatedData.phoneE164,
        latitude: validatedData.latitude,
        longitude: validatedData.longitude,
        isPrimary: validatedData.isPrimary || false,
        isActive: validatedData.isActive !== undefined ? validatedData.isActive : true,
        isVirtual: validatedData.isVirtual || false,
        publicInstructions: validatedData.publicInstructions,
        displayOrder: validatedData.displayOrder || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      if (!location) {
        throw new AppError({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to create location',
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
        action: 'location.created',
        targetType: 'location',
        targetId: location.id,
        reason: 'Location created',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Location created successfully', {
        ...this.context,
        locationId: location.id,
        businessId: '***MASKED***' ,
      });

      return location;
    } catch (error) {
      logger.error('Failed to create location', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update a location
   */
  async updateLocation(
    locationId: string,
    businessId: string,
    updateData: UpdateLocationRequest
  ): Promise<schema.Location> {
    try {
      // Validate the update data
      const validatedData = validate(updateLocationSchema, updateData);

      // Check if location exists and belongs to the business
      const existingLocation = await this.getLocation(locationId);

      if (existingLocation.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Location does not belong to the specified business',
        });
      }

      // Check if this would be the primary location
      if (validatedData.isPrimary !== undefined && validatedData.isPrimary) {
        // Check if there's already a primary location
        const existingPrimary = await db.query.locations.findFirst({
          where: (locations, { and, eq, ne }) => and(
            eq(locations.businessId, businessId),
            eq(locations.isPrimary, true),
            ne(locations.id, locationId)
          ),
        });

        if (existingPrimary) {
          // Unset the existing primary location
          await db.update(schema.locations)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(eq(schema.locations.id, existingPrimary.id));
        }
      }

      // Build update object
      const update: Partial<schema.Location> = {
        name: validatedData.name,
        addressLine1: validatedData.address?.addressLine1,
        addressLine2: validatedData.address?.addressLine2,
        city: validatedData.address?.city,
        region: validatedData.address?.region,
        postalCode: validatedData.address?.postalCode,
        countryCode: validatedData.address?.countryCode,
        timezoneOverride: validatedData.timezoneOverride,
        phoneE164: validatedData.phoneE164,
        latitude: validatedData.latitude,
        longitude: validatedData.longitude,
        isPrimary: validatedData.isPrimary,
        isActive: validatedData.isActive,
        isVirtual: validatedData.isVirtual,
        publicInstructions: validatedData.publicInstructions,
        displayOrder: validatedData.displayOrder,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(update).forEach(key => {
        if (update[key as keyof schema.Location] === undefined) {
          delete update[key as keyof schema.Location];
        }
      });

      // Update the location
      const [location] = await db.update(schema.locations)
        .set(update)
        .where(eq(schema.locations.id, locationId))
        .returning();

      if (!location) {
        throw new NotFoundError('Location', {
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
        action: 'location.updated',
        targetType: 'location',
        targetId: location.id,
        reason: 'Location updated',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Location updated successfully', {
        ...this.context,
        locationId: location.id,
        businessId: '***MASKED***' ,
      });

      return location;
    } catch (error) {
      logger.error('Failed to update location', {
        ...this.context,
        locationId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a location (soft delete - deactivate)
   */
  async deleteLocation(locationId: string, businessId: string): Promise<schema.Location> {
    try {
      // Check if location exists and belongs to the business
      const existingLocation = await this.getLocation(locationId);

      if (existingLocation.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Location does not belong to the specified business',
        });
      }

      // Check if this is the primary location
      if (existingLocation.isPrimary) {
        // Check if there are other locations to make primary
        const otherLocations = await db.query.locations.findMany({
          where: (locations, { and, eq, ne }) => and(
            eq(locations.businessId, businessId),
            eq(locations.isActive, true),
            ne(locations.id, locationId)
          ),
          orderBy: [asc(schema.locations.displayOrder)],
          limit: 1,
        });

        if (otherLocations.length > 0) {
          // Make the first other location primary
          await db.update(schema.locations)
            .set({ isPrimary: true, updatedAt: new Date() })
            .where(eq(schema.locations.id, otherLocations[0].id));
        }
      }

      // Deactivate the location (soft delete)
      const [location] = await db.update(schema.locations)
        .set({
          isActive: false,
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.locations.id, locationId))
        .returning();

      if (!location) {
        throw new NotFoundError('Location', {
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
        action: 'location.deleted',
        targetType: 'location',
        targetId: location.id,
        reason: 'Location deleted (deactivated)',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Location deleted successfully', {
        ...this.context,
        locationId: location.id,
        businessId: '***MASKED***' ,
      });

      return location;
    } catch (error) {
      logger.error('Failed to delete location', {
        ...this.context,
        locationId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Set primary location
   */
  async setPrimaryLocation(locationId: string, businessId: string): Promise<schema.Location> {
    try {
      // Check if location exists and belongs to the business
      const existingLocation = await this.getLocation(locationId);

      if (existingLocation.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Location does not belong to the specified business',
        });
      }

      // Get the current primary location
      const currentPrimary = await db.query.locations.findFirst({
        where: (locations, { and, eq }) => and(
          eq(locations.businessId, businessId),
          eq(locations.isPrimary, true)
        ),
      });

      // Update the new primary location
      const [location] = await db.update(schema.locations)
        .set({
          isPrimary: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.locations.id, locationId))
        .returning();

      if (!location) {
        throw new NotFoundError('Location', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      // If there was a previous primary location, unset it
      if (currentPrimary && currentPrimary.id !== locationId) {
        await db.update(schema.locations)
          .set({
            isPrimary: false,
            updatedAt: new Date(),
          })
          .where(eq(schema.locations.id, currentPrimary.id));
      }

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'location.primary_set',
        targetType: 'location',
        targetId: location.id,
        reason: 'Primary location set',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Primary location set successfully', {
        ...this.context,
        locationId: location.id,
        businessId: '***MASKED***' ,
      });

      return location;
    } catch (error) {
      logger.error('Failed to set primary location', {
        ...this.context,
        locationId: '***MASKED***' ,
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
 * Create a locations service instance
 */
export function createLocationsService(context: RequestTenantContext): LocationsService {
  return new LocationsService(context);
}

// Re-export types
export type { LocationWithDetails, CreateLocationRequest, UpdateLocationRequest, LocationListOptions, LocationListResult };
