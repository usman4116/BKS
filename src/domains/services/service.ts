/**
 * Services Domain Service
 * 
 * This service provides service-related operations as specified in PRD Section UC-005.
 * It handles service creation, updating, deletion, and listing for businesses.
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
  createServiceSchema,
  updateServiceSchema,
  createServiceCategorySchema,
  updateServiceCategorySchema,
  staffServiceSchema,
  validate 
} from '../../shared/validation/schemas';
import { 
  getTenantContext,
  RequestTenantContext
} from '../../infrastructure/auth/tenant-context';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, asc, inArray, or } from 'drizzle-orm';

// ============================================
// TYPES
// ============================================

/**
 * Service with full details
 */
export interface ServiceWithDetails extends schema.Service {
  category?: schema.ServiceCategory;
  location?: schema.Location;
  staffCount: number;
  bookingCount: number;
  priceFormatted: string;
  durationFormatted: string;
}

/**
 * Service category with services
 */
export interface ServiceCategoryWithServices extends schema.ServiceCategory {
  services: schema.Service[];
  serviceCount: number;
}

/**
 * Create service request
 */
export interface CreateServiceRequest {
  name: string;
  categoryId?: string;
  locationId?: string;
  description?: string;
  durationMinutes: number;
  prepBufferMinutes?: number;
  cleanupBufferMinutes?: number;
  priceMinor: number;
  currency?: string;
  minimumNoticeMinutesOverride?: number;
  bookingHorizonDaysOverride?: number;
  isActive?: boolean;
  isPublic?: boolean;
  displayOrder?: number;
}

/**
 * Update service request
 */
export interface UpdateServiceRequest {
  name?: string;
  categoryId?: string;
  locationId?: string;
  description?: string;
  durationMinutes?: number;
  prepBufferMinutes?: number;
  cleanupBufferMinutes?: number;
  priceMinor?: number;
  currency?: string;
  minimumNoticeMinutesOverride?: number;
  bookingHorizonDaysOverride?: number;
  isActive?: boolean;
  isPublic?: boolean;
  displayOrder?: number;
}

/**
 * Create service category request
 */
export interface CreateServiceCategoryRequest {
  name: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}

/**
 * Update service category request
 */
export interface UpdateServiceCategoryRequest {
  name?: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}

/**
 * Service list options
 */
export interface ServiceListOptions {
  categoryId?: string;
  locationId?: string;
  includeInactive?: boolean;
  includePrivate?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'displayOrder' | 'priceMinor' | 'durationMinutes' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Service list result
 */
export interface ServiceListResult {
  services: schema.Service[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Service category list options
 */
export interface ServiceCategoryListOptions {
  includeInactive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'displayOrder' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Service category list result
 */
export interface ServiceCategoryListResult {
  categories: schema.ServiceCategory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Staff service assignment request
 */
export interface StaffServiceAssignmentRequest {
  staffProfileId: string;
  serviceId: string;
  durationOverrideMinutes?: number;
  priceOverrideMinor?: number;
  isActive?: boolean;
}

// ============================================
// SERVICES SERVICE
// ============================================

/**
 * Services Service
 * Provides service-related operations
 */
export class ServicesService {
  private context: RequestTenantContext;

  constructor(context: RequestTenantContext) {
    this.context = context;
  }

  // ============================================
  // SERVICE CATEGORIES
  // ============================================

  /**
   * Get service category by ID
   */
  async getServiceCategory(categoryId: string): Promise<schema.ServiceCategory> {
    try {
      const category = await db.query.serviceCategories.findFirst({
        where: (categories, { eq }) => eq(categories.id, categoryId),
      });

      if (!category) {
        throw new NotFoundError('Service category', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      return category;
    } catch (error) {
      logger.error('Failed to get service category', {
        ...this.context,
        categoryId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get service category with services
   */
  async getServiceCategoryWithServices(categoryId: string): Promise<ServiceCategoryWithServices> {
    try {
      const category = await this.getServiceCategory(categoryId);

      // Get services in this category
      const services = await db.query.services.findMany({
        where: (services, { and, eq }) => and(
          eq(services.categoryId, categoryId),
          eq(services.businessId, category.businessId)
        ),
        orderBy: [asc(schema.services.displayOrder)],
      });

      return {
        ...category,
        services,
        serviceCount: services.length,
      };
    } catch (error) {
      logger.error('Failed to get service category with services', {
        ...this.context,
        categoryId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * List service categories for a business
   */
  async listServiceCategories(
    businessId: string,
    options: ServiceCategoryListOptions = {}
  ): Promise<ServiceCategoryListResult> {
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
        eq(schema.serviceCategories.businessId, businessId),
        includeInactive ? undefined : eq(schema.serviceCategories.isActive, true)
      );

      // Build order by clause
      let orderByClause;
      switch (sortBy) {
        case 'name':
          orderByClause = sortOrder === 'desc' ? desc(schema.serviceCategories.name) : asc(schema.serviceCategories.name);
          break;
        case 'createdAt':
          orderByClause = sortOrder === 'desc' ? desc(schema.serviceCategories.createdAt) : asc(schema.serviceCategories.createdAt);
          break;
        case 'displayOrder':
        default:
          orderByClause = sortOrder === 'desc' ? desc(schema.serviceCategories.displayOrder) : asc(schema.serviceCategories.displayOrder);
          break;
      }

      // Get categories
      const categories = await db.query.serviceCategories.findMany({
        where: whereClause,
        orderBy: [orderByClause],
        limit,
        offset: (page - 1) * limit,
      });

      // Get total count
      const total = await db.query.serviceCategories.count({
        where: whereClause,
      });

      const totalPages = Math.ceil(total / limit);
      const hasMore = page < totalPages;

      return {
        categories,
        total,
        page,
        limit,
        totalPages,
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to list service categories', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new service category
   */
  async createServiceCategory(
    businessId: string,
    categoryData: CreateServiceCategoryRequest
  ): Promise<schema.ServiceCategory> {
    try {
      // Validate the category data
      const validatedData = validate(createServiceCategorySchema, categoryData);

      // Create the category
      const [category] = await db.insert(schema.serviceCategories).values({
        id: uuidv4(),
        businessId,
        name: validatedData.name,
        description: validatedData.description,
        displayOrder: validatedData.displayOrder || 0,
        isActive: validatedData.isActive !== undefined ? validatedData.isActive : true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      if (!category) {
        throw new AppError({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to create service category',
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
        action: 'service_category.created',
        targetType: 'service_category',
        targetId: category.id,
        reason: 'Service category created',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Service category created successfully', {
        ...this.context,
        categoryId: category.id,
        businessId: '***MASKED***' ,
      });

      return category;
    } catch (error) {
      logger.error('Failed to create service category', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update a service category
   */
  async updateServiceCategory(
    categoryId: string,
    businessId: string,
    updateData: UpdateServiceCategoryRequest
  ): Promise<schema.ServiceCategory> {
    try {
      // Validate the update data
      const validatedData = validate(updateServiceCategorySchema, updateData);

      // Check if category exists and belongs to the business
      const existingCategory = await this.getServiceCategory(categoryId);

      if (existingCategory.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Service category does not belong to the specified business',
        });
      }

      // Build update object
      const update: Partial<schema.ServiceCategory> = {
        name: validatedData.name,
        description: validatedData.description,
        displayOrder: validatedData.displayOrder,
        isActive: validatedData.isActive,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(update).forEach(key => {
        if (update[key as keyof schema.ServiceCategory] === undefined) {
          delete update[key as keyof schema.ServiceCategory];
        }
      });

      // Update the category
      const [category] = await db.update(schema.serviceCategories)
        .set(update)
        .where(eq(schema.serviceCategories.id, categoryId))
        .returning();

      if (!category) {
        throw new NotFoundError('Service category', {
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
        action: 'service_category.updated',
        targetType: 'service_category',
        targetId: category.id,
        reason: 'Service category updated',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Service category updated successfully', {
        ...this.context,
        categoryId: category.id,
        businessId: '***MASKED***' ,
      });

      return category;
    } catch (error) {
      logger.error('Failed to update service category', {
        ...this.context,
        categoryId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a service category (soft delete - deactivate)
   */
  async deleteServiceCategory(categoryId: string, businessId: string): Promise<schema.ServiceCategory> {
    try {
      // Check if category exists and belongs to the business
      const existingCategory = await this.getServiceCategory(categoryId);

      if (existingCategory.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Service category does not belong to the specified business',
        });
      }

      // Check if category has services
      const serviceCount = await db.query.services.count({
        where: (services, { and, eq }) => and(
          eq(services.categoryId, categoryId),
          eq(services.businessId, businessId)
        ),
      });

      if (serviceCount > 0) {
        // Move services to uncategorized (categoryId = null)
        await db.update(schema.services)
          .set({ categoryId: null, updatedAt: new Date() })
          .where(
            and(
              eq(schema.services.categoryId, categoryId),
              eq(schema.services.businessId, businessId)
            )
          );
      }

      // Deactivate the category (soft delete)
      const [category] = await db.update(schema.serviceCategories)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.serviceCategories.id, categoryId))
        .returning();

      if (!category) {
        throw new NotFoundError('Service category', {
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
        action: 'service_category.deleted',
        targetType: 'service_category',
        targetId: category.id,
        reason: 'Service category deleted (deactivated)',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Service category deleted successfully', {
        ...this.context,
        categoryId: category.id,
        businessId: '***MASKED***' ,
      });

      return category;
    } catch (error) {
      logger.error('Failed to delete service category', {
        ...this.context,
        categoryId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ============================================
  // SERVICES
  // ============================================

  /**
   * Get service by ID
   */
  async getService(serviceId: string): Promise<schema.Service> {
    try {
      const service = await db.query.services.findFirst({
        where: (services, { eq }) => eq(services.id, serviceId),
      });

      if (!service) {
        throw new NotFoundError('Service', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      return service;
    } catch (error) {
      logger.error('Failed to get service', {
        ...this.context,
        serviceId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get service with details
   */
  async getServiceWithDetails(serviceId: string): Promise<ServiceWithDetails> {
    try {
      const service = await this.getService(serviceId);

      // Get category if assigned
      let category: schema.ServiceCategory | undefined;
      if (service.categoryId) {
        const categoryResult = await db.query.serviceCategories.findFirst({
          where: (categories, { eq }) => eq(categories.id, service.categoryId),
        });
        category = categoryResult || undefined;
      }

      // Get location if assigned
      let location: schema.Location | undefined;
      if (service.locationId) {
        const locationResult = await db.query.locations.findFirst({
          where: (locations, { eq }) => eq(locations.id, service.locationId),
        });
        location = locationResult || undefined;
      }

      // Get staff count
      const staffCount = await db.query.staffServices.count({
        where: (assignments, { and, eq }) => and(
          eq(assignments.serviceId, serviceId),
          eq(assignments.isActive, true)
        ),
      });

      // Get booking count
      const bookingCount = await db.query.bookings.count({
        where: (bookings, { eq }) => eq(bookings.serviceId, serviceId),
      });

      // Format price and duration
      const priceFormatted = this.formatPrice(service.priceMinor, service.currency);
      const durationFormatted = this.formatDuration(service.durationMinutes);

      return {
        ...service,
        category,
        location,
        staffCount,
        bookingCount,
        priceFormatted,
        durationFormatted,
      };
    } catch (error) {
      logger.error('Failed to get service with details', {
        ...this.context,
        serviceId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * List services for a business
   */
  async listServices(
    businessId: string,
    options: ServiceListOptions = {}
  ): Promise<ServiceListResult> {
    try {
      const {
        categoryId,
        locationId,
        includeInactive = false,
        includePrivate = true,
        page = 1,
        limit = 20,
        sortBy = 'displayOrder',
        sortOrder = 'asc',
      } = options;

      // Build where clause
      const whereClause = and(
        eq(schema.services.businessId, businessId),
        categoryId ? eq(schema.services.categoryId, categoryId) : undefined,
        locationId ? eq(schema.services.locationId, locationId) : undefined,
        includeInactive ? undefined : eq(schema.services.isActive, true),
        includePrivate ? undefined : eq(schema.services.isPublic, true)
      );

      // Build order by clause
      let orderByClause;
      switch (sortBy) {
        case 'name':
          orderByClause = sortOrder === 'desc' ? desc(schema.services.name) : asc(schema.services.name);
          break;
        case 'priceMinor':
          orderByClause = sortOrder === 'desc' ? desc(schema.services.priceMinor) : asc(schema.services.priceMinor);
          break;
        case 'durationMinutes':
          orderByClause = sortOrder === 'desc' ? desc(schema.services.durationMinutes) : asc(schema.services.durationMinutes);
          break;
        case 'createdAt':
          orderByClause = sortOrder === 'desc' ? desc(schema.services.createdAt) : asc(schema.services.createdAt);
          break;
        case 'displayOrder':
        default:
          orderByClause = sortOrder === 'desc' ? desc(schema.services.displayOrder) : asc(schema.services.displayOrder);
          break;
      }

      // Get services
      const services = await db.query.services.findMany({
        where: whereClause,
        orderBy: [orderByClause],
        limit,
        offset: (page - 1) * limit,
      });

      // Get total count
      const total = await db.query.services.count({
        where: whereClause,
      });

      const totalPages = Math.ceil(total / limit);
      const hasMore = page < totalPages;

      return {
        services,
        total,
        page,
        limit,
        totalPages,
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to list services', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new service
   */
  async createService(
    businessId: string,
    serviceData: CreateServiceRequest
  ): Promise<schema.Service> {
    try {
      // Validate the service data
      const validatedData = validate(createServiceSchema, serviceData);

      // Check if category exists and belongs to the business
      if (validatedData.categoryId) {
        const category = await db.query.serviceCategories.findFirst({
          where: (categories, { eq }) => eq(categories.id, validatedData.categoryId),
        });

        if (!category) {
          throw new NotFoundError('Service category', {
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
          });
        }

        if (category.businessId !== businessId) {
          throw new AuthorizationError({
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
            message: 'Service category does not belong to the specified business',
          });
        }
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

      // Create the service
      const [service] = await db.insert(schema.services).values({
        id: uuidv4(),
        businessId,
        categoryId: validatedData.categoryId,
        locationId: validatedData.locationId,
        name: validatedData.name,
        description: validatedData.description,
        durationMinutes: validatedData.durationMinutes,
        prepBufferMinutes: validatedData.prepBufferMinutes || 0,
        cleanupBufferMinutes: validatedData.cleanupBufferMinutes || 0,
        priceMinor: validatedData.priceMinor,
        currency: validatedData.currency || 'GBP',
        minimumNoticeMinutesOverride: validatedData.minimumNoticeMinutesOverride,
        bookingHorizonDaysOverride: validatedData.bookingHorizonDaysOverride,
        isActive: validatedData.isActive !== undefined ? validatedData.isActive : true,
        isPublic: validatedData.isPublic !== undefined ? validatedData.isPublic : true,
        displayOrder: validatedData.displayOrder || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      if (!service) {
        throw new AppError({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to create service',
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
        action: 'service.created',
        targetType: 'service',
        targetId: service.id,
        reason: 'Service created',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Service created successfully', {
        ...this.context,
        serviceId: service.id,
        businessId: '***MASKED***' ,
      });

      return service;
    } catch (error) {
      logger.error('Failed to create service', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update a service
   */
  async updateService(
    serviceId: string,
    businessId: string,
    updateData: UpdateServiceRequest
  ): Promise<schema.Service> {
    try {
      // Validate the update data
      const validatedData = validate(updateServiceSchema, updateData);

      // Check if service exists and belongs to the business
      const existingService = await this.getService(serviceId);

      if (existingService.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Service does not belong to the specified business',
        });
      }

      // Check if category exists and belongs to the business
      if (validatedData.categoryId) {
        const category = await db.query.serviceCategories.findFirst({
          where: (categories, { eq }) => eq(categories.id, validatedData.categoryId),
        });

        if (!category) {
          throw new NotFoundError('Service category', {
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
          });
        }

        if (category.businessId !== businessId) {
          throw new AuthorizationError({
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
            message: 'Service category does not belong to the specified business',
          });
        }
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
      const update: Partial<schema.Service> = {
        name: validatedData.name,
        categoryId: validatedData.categoryId,
        locationId: validatedData.locationId,
        description: validatedData.description,
        durationMinutes: validatedData.durationMinutes,
        prepBufferMinutes: validatedData.prepBufferMinutes,
        cleanupBufferMinutes: validatedData.cleanupBufferMinutes,
        priceMinor: validatedData.priceMinor,
        currency: validatedData.currency,
        minimumNoticeMinutesOverride: validatedData.minimumNoticeMinutesOverride,
        bookingHorizonDaysOverride: validatedData.bookingHorizonDaysOverride,
        isActive: validatedData.isActive,
        isPublic: validatedData.isPublic,
        displayOrder: validatedData.displayOrder,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(update).forEach(key => {
        if (update[key as keyof schema.Service] === undefined) {
          delete update[key as keyof schema.Service];
        }
      });

      // Update the service
      const [service] = await db.update(schema.services)
        .set(update)
        .where(eq(schema.services.id, serviceId))
        .returning();

      if (!service) {
        throw new NotFoundError('Service', {
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
        action: 'service.updated',
        targetType: 'service',
        targetId: service.id,
        reason: 'Service updated',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Service updated successfully', {
        ...this.context,
        serviceId: service.id,
        businessId: '***MASKED***' ,
      });

      return service;
    } catch (error) {
      logger.error('Failed to update service', {
        ...this.context,
        serviceId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a service (soft delete - deactivate)
   */
  async deleteService(serviceId: string, businessId: string): Promise<schema.Service> {
    try {
      // Check if service exists and belongs to the business
      const existingService = await this.getService(serviceId);

      if (existingService.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Service does not belong to the specified business',
        });
      }

      // Check if service has future bookings
      const futureBookings = await db.query.bookings.count({
        where: (bookings, { and, eq, gt }) => and(
          eq(bookings.serviceId, serviceId),
          gt(bookings.startsAt, new Date())
        ),
      });

      if (futureBookings > 0) {
        throw new ValidationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Cannot delete service with future bookings',
          fieldErrors: [
            {
              field: 'service',
              code: 'has_future_bookings',
              message: 'Service has future bookings and cannot be deleted',
            },
          ],
        });
      }

      // Deactivate the service (soft delete)
      const [service] = await db.update(schema.services)
        .set({
          isActive: false,
          isPublic: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.services.id, serviceId))
        .returning();

      if (!service) {
        throw new NotFoundError('Service', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      // Deactivate staff-service assignments
      await db.update(schema.staffServices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.staffServices.serviceId, serviceId));

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'service.deleted',
        targetType: 'service',
        targetId: service.id,
        reason: 'Service deleted (deactivated)',
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Service deleted successfully', {
        ...this.context,
        serviceId: service.id,
        businessId: '***MASKED***' ,
      });

      return service;
    } catch (error) {
      logger.error('Failed to delete service', {
        ...this.context,
        serviceId: '***MASKED***' ,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Assign staff to service
   */
  async assignStaffToService(
    businessId: string,
    assignment: StaffServiceAssignmentRequest
  ): Promise<schema.StaffService> {
    try {
      // Check if staff profile exists and belongs to the business
      const staff = await db.query.staffProfiles.findFirst({
        where: (staff, { eq }) => eq(staff.id, assignment.staffProfileId),
      });

      if (!staff) {
        throw new NotFoundError('Staff profile', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      if (staff.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Staff profile does not belong to the specified business',
        });
      }

      // Check if service exists and belongs to the business
      const service = await db.query.services.findFirst({
        where: (services, { eq }) => eq(services.id, assignment.serviceId),
      });

      if (!service) {
        throw new NotFoundError('Service', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      if (service.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Service does not belong to the specified business',
        });
      }

      // Check if assignment already exists
      const existingAssignment = await db.query.staffServices.findFirst({
        where: (assignments, { and, eq }) => and(
          eq(assignments.staffProfileId, assignment.staffProfileId),
          eq(assignments.serviceId, assignment.serviceId)
        ),
      });

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

        if (!updatedAssignment) {
          throw new AppError({
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to update staff-service assignment',
            requestId: this.context.requestId,
            correlationId: this.context.correlationId,
          });
        }

        return updatedAssignment;
      }

      // Create new assignment
      const [newAssignment] = await db.insert(schema.staffServices).values({
        businessId,
        staffProfileId: assignment.staffProfileId,
        serviceId: assignment.serviceId,
        durationOverrideMinutes: assignment.durationOverrideMinutes,
        priceOverrideMinor: assignment.priceOverrideMinor,
        isActive: assignment.isActive !== undefined ? assignment.isActive : true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      if (!newAssignment) {
        throw new AppError({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to create staff-service assignment',
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
        action: 'staff_service.assigned',
        targetType: 'staff_service',
        targetId: newAssignment.id,
        reason: `Staff ${assignment.staffProfileId} assigned to service ${assignment.serviceId}`,
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Staff assigned to service successfully', {
        ...this.context,
        staffId: assignment.staffProfileId,
        serviceId: assignment.serviceId,
        businessId: '***MASKED***' ,
      });

      return newAssignment;
    } catch (error) {
      logger.error('Failed to assign staff to service', {
        ...this.context,
        staffId: assignment.staffProfileId,
        serviceId: assignment.serviceId,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove staff from service
   */
  async removeStaffFromService(
    businessId: string,
    staffProfileId: string,
    serviceId: string
  ): Promise<schema.StaffService> {
    try {
      // Check if assignment exists
      const assignment = await db.query.staffServices.findFirst({
        where: (assignments, { and, eq }) => and(
          eq(assignments.staffProfileId, staffProfileId),
          eq(assignments.serviceId, serviceId)
        ),
      });

      if (!assignment) {
        throw new NotFoundError('Staff-service assignment', {
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
        });
      }

      // Check if assignment belongs to the business
      if (assignment.businessId !== businessId) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'Staff-service assignment does not belong to the specified business',
        });
      }

      // Deactivate the assignment
      const [updatedAssignment] = await db.update(schema.staffServices)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.staffServices.id, assignment.id))
        .returning();

      if (!updatedAssignment) {
        throw new NotFoundError('Staff-service assignment', {
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
        action: 'staff_service.removed',
        targetType: 'staff_service',
        targetId: assignment.id,
        reason: `Staff ${staffProfileId} removed from service ${serviceId}`,
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Staff removed from service successfully', {
        ...this.context,
        staffId: staffProfileId,
        serviceId,
        businessId: '***MASKED***' ,
      });

      return updatedAssignment;
    } catch (error) {
      logger.error('Failed to remove staff from service', {
        ...this.context,
        staffId: staffProfileId,
        serviceId,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Reorder services
   */
  async reorderServices(
    businessId: string,
    serviceOrders: { serviceId: string; displayOrder: number }[]
  ): Promise<schema.Service[]> {
    try {
      // Validate that all services belong to the business
      const serviceIds = serviceOrders.map(o => o.serviceId);
      const services = await db.query.services.findMany({
        where: (services, { and, inArray, eq }) => and(
          inArray(services.id, serviceIds),
          eq(services.businessId, businessId)
        ),
      });

      if (services.length !== serviceIds.length) {
        throw new AuthorizationError({
          requestId: this.context.requestId,
          correlationId: this.context.correlationId,
          message: 'One or more services do not belong to the business',
        });
      }

      // Update display orders in a transaction
      const updatedServices: schema.Service[] = [];

      for (const order of serviceOrders) {
        const [service] = await db.update(schema.services)
          .set({
            displayOrder: order.displayOrder,
            updatedAt: new Date(),
          })
          .where(eq(schema.services.id, order.serviceId))
          .returning();

        if (service) {
          updatedServices.push(service);
        }
      }

      // Create audit event
      await db.insert(schema.auditEvents).values({
        id: uuidv4(),
        businessId,
        actorType: 'business_user',
        actorId: this.context.userId || 'unknown',
        action: 'services.reordered',
        targetType: 'service',
        reason: `Reordered ${updatedServices.length} services`,
        correlationId: this.context.correlationId,
        createdAt: new Date(),
      });

      logger.info('Services reordered successfully', {
        ...this.context,
        businessId: '***MASKED***' ,
        serviceCount: updatedServices.length,
      });

      return updatedServices;
    } catch (error) {
      logger.error('Failed to reorder services', {
        ...this.context,
        businessId: '***MASKED***' ,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Format price for display
   */
  private formatPrice(priceMinor: number, currency: string): string {
    const price = priceMinor / 100;
    
    switch (currency) {
      case 'GBP':
        return `£${price.toFixed(2)}`;
      case 'USD':
        return `$${price.toFixed(2)}`;
      case 'EUR':
        return `€${price.toFixed(2)}`;
      default:
        return `${currency} ${price.toFixed(2)}`;
    }
  }

  /**
   * Format duration for display
   */
  private formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    
    return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} min`;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a services service instance
 */
export function createServicesService(context: RequestTenantContext): ServicesService {
  return new ServicesService(context);
}

// Re-export types
export type { 
  ServiceWithDetails, 
  ServiceCategoryWithServices,
  CreateServiceRequest,
  UpdateServiceRequest,
  CreateServiceCategoryRequest,
  UpdateServiceCategoryRequest,
  ServiceListOptions,
  ServiceListResult,
  ServiceCategoryListOptions,
  ServiceCategoryListResult,
  StaffServiceAssignmentRequest 
};
