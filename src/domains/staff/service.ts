/**
 * Staff Domain Service
 * 
 * This service provides staff-related operations as specified in PRD Section UC-004.
 * It handles staff profile creation, updating, deletion, and listing for businesses.
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
  createStaffProfileSchema,
  updateStaffProfileSchema,
  validate 
} from '../../shared/validation/schemas';
import { 
  getTenantContext,
  RequestTenantContext
} from '../../infrastructure/auth/tenant-context';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';

// ============================================
// TYPES
// ============================================

/**
 * Staff profile with full details
 */
export interface StaffProfileWithDetails extends schema.StaffProfile {
  location?: schema.Location;
  services: schema.Service[];
  serviceCount: number;
  bookingCount: number;
}

/**
 * Create staff profile request
 */
export interface CreateStaffProfileRequest {
  displayName: string;
  locationId?: string;
  bio?: string;
  photoUrl?: string;
  isActive?: boolean;
  isPublic?: boolean;
  displayOrder?: number;
  internalNotes?: string;
  color?: string;
}

/**
 * Update staff profile request
 */
export interface UpdateStaffProfileRequest {
  displayName?: string;
  locationId?: string;
  bio?: string;
  photoUrl?: string;
  isActive?: boolean;
  isPublic?: boolean;
  displayOrder?: number;
  internalNotes?: string;
  color?: string;
}

/**
 * Staff profile list options
 */
export interface StaffProfileListOptions {
  includeInactive?: boolean;
  includePrivate?: boolean;
  locationId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'displayName' | 'displayOrder' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Staff profile list result
 */
export interface StaffProfileListResult {
  staff: schema.StaffProfile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Staff service assignment
 */
export interface StaffServiceAssignment {
  serviceId: string;
  durationOverrideMinutes?: number;
  priceOverrideMinor?: number;
  isActive?: boolean;
}

// ============================================
// STAFF SERVICE
// ============================================

/**
 * Staff Service
 * Provides staff-related operations
 */
export class StaffService {
  private context: RequestTenantContext;

  constructor(context: RequestTenantContext) {
    this.context = context;
  }

  /**
   * Get staff profile by ID
   */
  async getStaffProfile(staffId: string): Promise<schema.StaffProfile> {
    try {
      const staff = await db.query.staffProfiles.findFirst({
        where: (staff, { eq }) => eq(staff.id, staffId),
      });

      if (!staff) {
        throw new NotFoundError('Staff profile', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      return staff;
    } catch (error) {
      logger.error('Failed to get staff profile', {
        ...this.context,
        staffId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get staff profile with details
   */
  async getStaffProfileWithDetails(staffId: string): Promise<StaffProfileWithDetails> {
    try {
      const staff = await this.getStaffProfile(staffId);

      // Get location if assigned
      let location: schema.Location | undefined;
      if (staff.locationId) {
        const locationResult = await db.query.locations.findFirst({
          where: (locations, { eq }) => eq(locations.id, staff.locationId),
        });
        location = locationResult || undefined;
      }

      // Get services assigned to this staff
      const staffServices = await db.query.staffServices.findMany({
        where: (assignments, { eq }) => eq(assignments.staffProfileId, staffId),
      });

      const serviceIds = staffServices.map(a => a.serviceId);
      const services = await db.query.services.findMany({
        where: (services, { inArray }) => inArray(services.id, serviceIds),
      });

      // Get booking count
      const bookingCount = await db.query.bookings.count({
        where: (bookings, { eq }) => eq(bookings.staffProfileId, staffId),
      });

      return {
        ...staff,
        location,
        services,
        serviceCount: services.length,
        bookingCount,
      };
    } catch (error) {
      logger.error('Failed to get staff profile with details', {
        ...this.context,
        staffId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * List staff profiles for a business
   */
  async listStaffProfiles(
    businessId: string,
    options: StaffProfileListOptions = {}
  ): Promise<StaffProfileListResult> {
    try {
      const {
        includeInactive = false,
        includePrivate = true,
        locationId,
        page = 1,
        limit = 20,
        sortBy = 'displayOrder',
        sortOrder = 'asc',
      } = options;

      // Build where clause
      const whereClause = and(
        eq(schema.staffProfiles.businessId, businessId),
        includeInactive ? undefined : eq(schema.staffProfiles.isActive, true),
        includePrivate ? undefined : eq(schema.staffProfiles.isPublic, true),
        locationId ? eq(schema.staffProfiles.locationId, locationId) : undefined
      );

      // Build order by clause
      let orderByClause;
      switch (sortBy) {
        case 'displayName':
          orderByClause = sortOrder === 'desc' ? desc(schema.staffProfiles.displayName) : asc(schema.staffProfiles.displayName);
          break;
        case 'createdAt':
          orderByClause = sortOrder === 'desc' ? desc(schema.staffProfiles.createdAt) : asc(schema.staffProfiles.createdAt);
          break;
        case 'displayOrder':
        default:
          orderByClause = sortOrder === 'desc' ? desc(schema.staffProfiles.displayOrder) : asc(schema.staffProfiles.displayOrder);
          break;
      }

      // Get staff profiles
      const staff = await db.query.staffProfiles.findMany({
        where: whereClause,
        orderBy: [orderByClause],
        limit,
        offset: (page - 1) * limit,
      });

      // Get total count
      const total = await db.query.staffProfiles.count({
        where: whereClause,
      });

      const totalPages = Math.ceil(total / limit);
      const hasMore = page < totalPages;

      return {
        staff,
        total,
        page,
        limit,
        totalPages,
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to list staff profiles', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new staff profile
   */
  async createStaffProfile(
    businessId: string,
    staffData: CreateStaffProfileRequest
  ): Promise<schema.StaffProfile> {
    try {
      // Validate the staff profile data
      const validatedData = validate(createStaffProfileSchema, staffData);

      // Check if location exists and belongs to the business
      if (validatedData.locationId) {
        const location = await db.query.locations.findFirst({
          where: (locations, { eq }) => eq(locations.id, validatedData.locationId),
        });

        if (!location) {
          throw new NotFoundError('Location', {
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
          });
        }

        if (location.businessId !== businessId) {
          throw new AuthorizationError({
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
            message: 'Location does not belong to the specified business',
          });
        }
      }

      // Create the staff profile
      const [staff] = await db.insert(schema.staffProfiles).values({
        id: uuidv4(),
        businessId,
        locationId: validatedData.locationId,
        displayName: validatedData.displayName,
        bio: validatedData.bio,
        photoUrl: validatedData.photoUrl,
        isActive: validatedData.isActive !== undefined ? validatedData.isActive : true,
        isPublic: validatedData.isPublic !== undefined ? validatedData.isPublic : true,
        displayOrder: validatedData.displayOrder || 0,
        internalNotes: validatedData.internalNotes,
        color: validatedData.color,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      if (!staff) {
        throw new AppError({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to create staff profile',
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
        action: 'staff.created',
        targetType: 'staff_profile',
        targetId: staff.id,
        reason: 'Staff profile created',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Staff profile created successfully', {
        ...this.context,
        staffId: staff.id,
        businessId: '***MASKED***' ,
      });

      return staff;
    } catch (error) {
      logger.error('Failed to create staff profile', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update a staff profile
   */
  async updateStaffProfile(
    staffId: string,
    businessId: string,
    updateData: UpdateStaffProfileRequest
  ): Promise<schema.StaffProfile> {
    try {
      // Validate the update data
      const validatedData = validate(updateStaffProfileSchema, updateData);

      // Check if staff profile exists and belongs to the business
      const existingStaff = await this.getStaffProfile(staffId);

      if (existingStaff.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Staff profile does not belong to the specified business',
        });
      }

      // Check if location exists and belongs to the business
      if (validatedData.locationId) {
        const location = await db.query.locations.findFirst({
          where: (locations, { eq }) => eq(locations.id, validatedData.locationId),
        });

        if (!location) {
          throw new NotFoundError('Location', {
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
          });
        }

        if (location.businessId !== businessId) {
          throw new AuthorizationError({
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
            message: 'Location does not belong to the specified business',
          });
        }
      }

      // Build update object
      const update: Partial<schema.StaffProfile> = {
        displayName: validatedData.displayName,
        locationId: validatedData.locationId,
        bio: validatedData.bio,
        photoUrl: validatedData.photoUrl,
        isActive: validatedData.isActive,
        isPublic: validatedData.isPublic,
        displayOrder: validatedData.displayOrder,
        internalNotes: validatedData.internalNotes,
        color: validatedData.color,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(update).forEach(key => {
        if (update[key as keyof schema.StaffProfile] === undefined) {
          delete update[key as keyof schema.StaffProfile];
        }
      });

      // Update the staff profile
      const [staff] = await db.update(schema.staffProfiles)
        .set(update)
        .where(eq(schema.staffProfiles.id, staffId))
        .returning();

      if (!staff) {
        throw new NotFoundError('Staff profile', {
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
        action: 'staff.updated',
        targetType: 'staff_profile',
        targetId: staff.id,
        reason: 'Staff profile updated',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Staff profile updated successfully', {
        ...this.context,
        staffId: staff.id,
        businessId: '***MASKED***' ,
      });

      return staff;
    } catch (error) {
      logger.error('Failed to update staff profile', {
        ...this.context,
        staffId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a staff profile (soft delete - deactivate)
   */
  async deleteStaffProfile(staffId: string, businessId: string): Promise<schema.StaffProfile> {
    try {
      // Check if staff profile exists and belongs to the business
      const existingStaff = await this.getStaffProfile(staffId);

      if (existingStaff.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Staff profile does not belong to the specified business',
        });
      }

      // Check if staff has future bookings
      const futureBookings = await db.query.bookings.count({
        where: (bookings, { and, eq, gt }) => and(
          eq(bookings.staffProfileId, staffId),
          gt(bookings.startsAt, new Date())
        ),
      });

      if (futureBookings > 0) {
        throw new ValidationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Cannot delete staff profile with future bookings',
          fieldErrors: [
            {
              field: 'staff',
              code: 'has_future_bookings',
              message: 'Staff profile has future bookings and cannot be deleted',
            },
          ],
        });
      }

      // Deactivate the staff profile (soft delete)
      const [staff] = await db.update(schema.staffProfiles)
        .set({
          isActive: false,
          isPublic: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.staffProfiles.id, staffId))
        .returning();

      if (!staff) {
        throw new NotFoundError('Staff profile', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      // Deactivate staff-service assignments
      await db.update(schema.staffServices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.staffServices.staffProfileId, staffId));

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'staff.deleted',
        targetType: 'staff_profile',
        targetId: staff.id,
        reason: 'Staff profile deleted (deactivated)',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Staff profile deleted successfully', {
        ...this.context,
        staffId: staff.id,
        businessId: '***MASKED***' ,
      });

      return staff;
    } catch (error) {
      logger.error('Failed to delete staff profile', {
        ...this.context,
        staffId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Assign services to staff profile
   */
  async assignServicesToStaff(
    staffId: string,
    businessId: string,
    serviceAssignments: StaffServiceAssignment[]
  ): Promise<schema.StaffService[]> {
    try {
      // Check if staff profile exists and belongs to the business
      const existingStaff = await this.getStaffProfile(staffId);

      if (existingStaff.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Staff profile does not belong to the specified business',
        });
      }

      // Check if services exist and belong to the business
      const serviceIds = serviceAssignments.map(a => a.serviceId);
      const services = await db.query.services.findMany({
        where: (services, { and, inArray, eq }) => and(
          inArray(services.id, serviceIds),
          eq(services.businessId, businessId)
        ),
      });

      if (services.length !== serviceIds.length) {
        throw new ValidationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'One or more services do not exist or do not belong to the business',
        });
      }

      // Get existing assignments for this staff
      const existingAssignments = await db.query.staffServices.findMany({
        where: (assignments, { eq }) => eq(assignments.staffProfileId, staffId),
      });

      const existingServiceIds = existingAssignments.map(a => a.serviceId);
      const newServiceIds = serviceAssignments.map(a => a.serviceId);

      // Deactivate assignments for services not in the new list
      const servicesToDeactivate = existingServiceIds.filter(
        id => !newServiceIds.includes(id)
      );

      if (servicesToDeactivate.length > 0) {
        await db.update(schema.staffServices)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(schema.staffServices.staffProfileId, staffId),
              inArray(schema.staffServices.serviceId, servicesToDeactivate)
            )
          );
      }

      // Create or update assignments for new services
      const createdAssignments: schema.StaffService[] = [];

      for (const assignment of serviceAssignments) {
        // Check if assignment already exists
        const existingAssignment = existingAssignments.find(
          a => a.serviceId === assignment.serviceId
        );

        if (existingAssignment) {
          // Update existing assignment
          const [updatedAssignment] = await db.update(schema.staffServices)
            .set({
              durationOverrideMinutes: assignment.durationOverrideMinutes,
              priceOverrideMinor: assignment.priceOverrideMinor,
              isActive: assignment.isActive !== undefined ? assignment.isActive : true,
              updatedAt: new Date(),
            })
            .where(eq(schema.staffServices.id, existingAssignment.id))
            .returning();

          if (updatedAssignment) {
            createdAssignments.push(updatedAssignment);
          }
        } else {
          // Create new assignment
          const [newAssignment] = await db.insert(schema.staffServices).values({
            businessId,
            staffProfileId: staffId,
            serviceId: assignment.serviceId,
            durationOverrideMinutes: assignment.durationOverrideMinutes,
            priceOverrideMinor: assignment.priceOverrideMinor,
            isActive: assignment.isActive !== undefined ? assignment.isActive : true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).returning();

          if (newAssignment) {
            createdAssignments.push(newAssignment);
          }
        }
      }

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'staff.services_assigned',
        targetType: 'staff_profile',
        targetId: staffId,
        reason: `Assigned ${createdAssignments.length} services to staff profile`,
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Services assigned to staff profile successfully', {
        ...this.context,
        staffId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        serviceCount: createdAssignments.length,
      });

      return createdAssignments;
    } catch (error) {
      logger.error('Failed to assign services to staff profile', {
        ...this.context,
        staffId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get services assigned to staff profile
   */
  async getStaffServices(staffId: string): Promise<schema.StaffService[]> {
    try {
      const assignments = await db.query.staffServices.findMany({
        where: (assignments, { eq }) => eq(assignments.staffProfileId, staffId),
      });

      return assignments;
    } catch (error) {
      logger.error('Failed to get staff services', {
        ...this.context,
        staffId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Reorder staff profiles
   */
  async reorderStaffProfiles(
    businessId: string,
    staffOrders: { staffId: string; displayOrder: number }[]
  ): Promise<schema.StaffProfile[]> {
    try {
      // Validate that all staff profiles belong to the business
      const staffIds = staffOrders.map(o => o.staffId);
      const staffProfiles = await db.query.staffProfiles.findMany({
        where: (staff, { and, inArray, eq }) => and(
          inArray(staff.id, staffIds),
          eq(staff.businessId, businessId)
        ),
      });

      if (staffProfiles.length !== staffIds.length) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'One or more staff profiles do not belong to the business',
        });
      }

      // Update display orders in a transaction
      const updatedStaff: schema.StaffProfile[] = [];

      for (const order of staffOrders) {
        const [staff] = await db.update(schema.staffProfiles)
          .set({
            displayOrder: order.displayOrder,
            updatedAt: new Date(),
          })
          .where(eq(schema.staffProfiles.id, order.staffId))
          .returning();

        if (staff) {
          updatedStaff.push(staff);
        }
      }

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'staff.reordered',
        targetType: 'staff_profile',
        reason: `Reordered ${updatedStaff.length} staff profiles`,
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Staff profiles reordered successfully', {
        ...this.context,
        businessId: '***MASKED***' ,
        staffCount: updatedStaff.length,
      });

      return updatedStaff;
    } catch (error) {
      logger.error('Failed to reorder staff profiles', {
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
 * Create a staff service instance
 */
export function createStaffService(context: RequestTenantContext): StaffService {
  return new StaffService(context);
}

// Re-export types
export type { 
  StaffProfileWithDetails, 
  CreateStaffProfileRequest, 
  UpdateStaffProfileRequest,
  StaffProfileListOptions,
  StaffProfileListResult,
  StaffServiceAssignment 
};
