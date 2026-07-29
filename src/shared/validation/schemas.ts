/**
 * Validation Schemas for the Multi-Tenant Booking Platform
 * 
 * This file contains Zod schemas for request validation as specified in the PRD.
 * All public and authenticated API requests should be validated using these schemas.
 */

import { z } from 'zod';
import { ERROR_CODES } from '../errors/types';

// ============================================
// COMMON SCHEMAS
// ============================================

/**
 * UUID schema
 */
export const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });

/**
 * ISO 8601 datetime schema
 */
export const isoDateTimeSchema = z.string().datetime({ 
  message: 'Invalid datetime format. Expected ISO 8601 format (YYYY-MM-DDTHH:mm:ss.SSSZ)' 
});

/**
 * ISO 8601 date schema
 */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Invalid date format. Expected YYYY-MM-DD'
});

/**
 * IANA timezone schema
 */
export const timezoneSchema = z.string().regex(/^[A-Za-z\/]+$/, {
  message: 'Invalid timezone. Expected IANA timezone (e.g., Europe/London)'
});

/**
 * ISO 4217 currency schema
 */
export const currencySchema = z.string().length(3, {
  message: 'Invalid currency. Expected ISO 4217 currency code (3 letters)'
}).toUpperCase();

/**
 * E.164 phone number schema
 */
export const phoneE164Schema = z.string().regex(/^\+\d{1,15}$/, {
  message: 'Invalid phone number. Expected E.164 format (e.g., +441234567890)'
});

/**
 * Email schema
 */
export const emailSchema = z.string().email({ 
  message: 'Invalid email address' 
}).toLowerCase();

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});

/**
 * Sorting schema
 */
export const sortSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

// ============================================
// BUSINESS SCHEMAS
// ============================================

/**
 * Business slug schema
 */
export const businessSlugSchema = z.string()
  .min(3, { message: 'Business slug must be at least 3 characters' })
  .max(50, { message: 'Business slug must be at most 50 characters' })
  .regex(/^[a-z0-9-]+$/, {
    message: 'Business slug can only contain lowercase letters, numbers, and hyphens'
  });

/**
 * Business type schema
 */
export const businessTypeSchema = z.enum([
  'salon',
  'barbershop',
  'nail_studio',
  'beauty',
  'mechanic',
  'plumber',
  'electrician',
  'consultant',
  'other',
]);

/**
 * Business status schema
 */
export const businessStatusSchema = z.enum([
  'draft',
  'active',
  'suspended',
  'cancelled',
]);

/**
 * Create business schema (for onboarding)
 */
export const createBusinessSchema = z.object({
  name: z.string()
    .min(1, { message: 'Business name is required' })
    .max(100, { message: 'Business name must be at most 100 characters' }),
  slug: businessSlugSchema,
  businessType: businessTypeSchema.default('salon'),
  timezone: timezoneSchema.default('Europe/London'),
  currency: currencySchema.default('GBP'),
  locale: z.string().default('en-GB'),
  email: emailSchema,
  phoneE164: phoneE164Schema,
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Invalid color format. Expected hex color (e.g., #FF0000)'
  }).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Invalid color format. Expected hex color (e.g., #00FF00)'
  }).optional(),
});

/**
 * Update business schema
 */
export const updateBusinessSchema = createBusinessSchema.partial();

/**
 * Business settings schema
 */
export const businessSettingsSchema = z.object({
  bookingPagePublished: z.boolean().optional(),
  bookingHorizonDays: z.number().int().min(1).max(180).optional(),
  minimumNoticeMinutes: z.number().int().min(0).max(1440).optional(),
  cancellationNoticeMinutes: z.number().int().min(0).max(1440).optional(),
  slotIncrementMinutes: z.number().int().min(5).max(60).optional(),
});

// ============================================
// LOCATION SCHEMAS
// ============================================

/**
 * Address schema
 */
export const addressSchema = z.object({
  addressLine1: z.string().min(1).max(100),
  addressLine2: z.string().max(100).optional(),
  city: z.string().min(1).max(50),
  region: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  countryCode: z.string().length(2).toUpperCase().default('GB'),
});

/**
 * Location schema
 */
export const locationSchema = z.object({
  name: z.string().min(1).max(100),
  address: addressSchema.optional(),
  phoneE164: phoneE164Schema.optional(),
  timezoneOverride: timezoneSchema.optional(),
  latitude: z.string().regex(/^-?\d{1,3}\.\d+$/, {
    message: 'Invalid latitude format'
  }).optional(),
  longitude: z.string().regex(/^-?\d{1,3}\.\d+$/, {
    message: 'Invalid longitude format'
  }).optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isVirtual: z.boolean().optional(),
  publicInstructions: z.string().max(500).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

/**
 * Create location schema
 */
export const createLocationSchema = locationSchema.extend({
  address: addressSchema,
  name: z.string().min(1).max(100),
});

/**
 * Update location schema
 */
export const updateLocationSchema = locationSchema.partial();

// ============================================
// STAFF PROFILE SCHEMAS
// ============================================

/**
 * Staff profile schema
 */
export const staffProfileSchema = z.object({
  displayName: z.string().min(1).max(100),
  bio: z.string().max(1000).optional(),
  photoUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  internalNotes: z.string().max(2000).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Invalid color format. Expected hex color (e.g., #FF0000)'
  }).optional(),
});

/**
 * Create staff profile schema
 */
export const createStaffProfileSchema = staffProfileSchema.extend({
  displayName: z.string().min(1).max(100),
  locationId: uuidSchema.optional(),
});

/**
 * Update staff profile schema
 */
export const updateStaffProfileSchema = staffProfileSchema.partial();

// ============================================
// SERVICE SCHEMAS
// ============================================

/**
 * Service schema
 */
export const serviceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(5).max(720).default(30),
  prepBufferMinutes: z.number().int().min(0).max(240).default(0),
  cleanupBufferMinutes: z.number().int().min(0).max(240).default(0),
  priceMinor: z.number().int().min(0).max(10000000).default(0), // Max ~£100,000
  currency: currencySchema.default('GBP'),
  minimumNoticeMinutesOverride: z.number().int().min(0).max(1440).optional(),
  bookingHorizonDaysOverride: z.number().int().min(1).max(180).optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

/**
 * Create service schema
 */
export const createServiceSchema = serviceSchema.extend({
  name: z.string().min(1).max(100),
  categoryId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
});

/**
 * Update service schema
 */
export const updateServiceSchema = serviceSchema.partial();

/**
 * Service category schema
 */
export const serviceCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Create service category schema
 */
export const createServiceCategorySchema = serviceCategorySchema.extend({
  name: z.string().min(1).max(100),
});

/**
 * Staff service assignment schema
 */
export const staffServiceSchema = z.object({
  staffProfileId: uuidSchema,
  serviceId: uuidSchema,
  durationOverrideMinutes: z.number().int().min(5).max(720).optional(),
  priceOverrideMinor: z.number().int().min(0).max(10000000).optional(),
  isActive: z.boolean().optional(),
});

// ============================================
// AVAILABILITY SCHEMAS
// ============================================

/**
 * Day of week schema (0-6, Sunday = 0)
 */
export const dayOfWeekSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

/**
 * Time schema (HH:mm:ss)
 */
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, {
  message: 'Invalid time format. Expected HH:mm:ss'
});

/**
 * Availability rule schema
 */
export const availabilityRuleSchema = z.object({
  locationId: uuidSchema.optional(),
  staffProfileId: uuidSchema.optional(),
  resourceId: uuidSchema.optional(),
  dayOfWeek: dayOfWeekSchema,
  localStartTime: timeSchema,
  localEndTime: timeSchema,
  effectiveFrom: isoDateSchema,
  effectiveUntil: isoDateSchema.optional(),
  isActive: z.boolean().optional(),
});

/**
 * Create availability rule schema
 */
export const createAvailabilityRuleSchema = availabilityRuleSchema.extend({
  dayOfWeek: dayOfWeekSchema,
  localStartTime: timeSchema,
  localEndTime: timeSchema,
  effectiveFrom: isoDateSchema,
});

/**
 * Availability exception type schema
 */
export const availabilityExceptionTypeSchema = z.enum([
  'closed',
  'open_override',
  'break',
  'leave',
  'manual_block',
]);

/**
 * Availability exception schema
 */
export const availabilityExceptionSchema = z.object({
  locationId: uuidSchema.optional(),
  staffProfileId: uuidSchema.optional(),
  resourceId: uuidSchema.optional(),
  exceptionType: availabilityExceptionTypeSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  reason: z.string().max(500).optional(),
});

/**
 * Create availability exception schema
 */
export const createAvailabilityExceptionSchema = availabilityExceptionSchema.extend({
  exceptionType: availabilityExceptionTypeSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
});

// ============================================
// CUSTOMER SCHEMAS
// ============================================

/**
 * Customer schema
 */
export const customerSchema = z.object({
  displayName: z.string().min(1).max(100),
  email: emailSchema.optional(),
  phoneE164: phoneE164Schema.optional(),
  internalNotes: z.string().max(2000).optional(),
  marketingEmailConsent: z.boolean().optional(),
  marketingSmsConsent: z.boolean().optional(),
});

/**
 * Create customer schema
 */
export const createCustomerSchema = customerSchema.extend({
  displayName: z.string().min(1).max(100),
});

/**
 * Update customer schema
 */
export const updateCustomerSchema = customerSchema.partial();

/**
 * Customer search schema
 */
export const customerSearchSchema = z.object({
  query: z.string().min(1).max(100).optional(),
  email: emailSchema.optional(),
  phone: phoneE164Schema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// ============================================
// BOOKING SCHEMAS
// ============================================

/**
 * Booking source schema
 */
export const bookingSourceSchema = z.enum([
  'phone',
  'walk_in',
  'admin',
  'import',
  'public',
]);

/**
 * Booking status schema
 */
export const bookingStatusSchema = z.enum([
  'draft',
  'pending_payment',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled_by_customer',
  'cancelled_by_business',
  'no_show',
  'rescheduled',
  'expired',
]);

/**
 * Create booking schema (public)
 */
export const createBookingSchema = z.object({
  locationId: uuidSchema,
  serviceId: uuidSchema,
  staffProfileId: uuidSchema.optional(), // If not provided, use any_available
  requestedStart: isoDateTimeSchema,
  customerName: z.string().min(1).max(100),
  customerEmail: emailSchema,
  customerPhone: phoneE164Schema.optional(),
  customerNote: z.string().max(1000).optional(),
  customerTimezone: timezoneSchema.optional(),
  acceptedPolicyVersion: z.string().min(1),
  idempotencyKey: z.string().min(1).max(100),
});

/**
 * Create manual booking schema (business)
 */
export const createManualBookingSchema = createBookingSchema.extend({
  source: bookingSourceSchema.default('admin'),
  overrideReason: z.string().max(500).optional(),
  suppressNotifications: z.boolean().optional(),
  placeholderContact: z.boolean().optional(),
});

/**
 * Update booking schema
 */
export const updateBookingSchema = z.object({
  customerNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});

/**
 * Booking status change schema
 */
export const bookingStatusChangeSchema = z.object({
  toStatus: bookingStatusSchema,
  reason: z.string().max(500).optional(),
});

/**
 * Cancel booking schema
 */
export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
  suppressNotifications: z.boolean().optional(),
});

/**
 * Reschedule booking schema
 */
export const rescheduleBookingSchema = z.object({
  newStartTime: isoDateTimeSchema,
  newStaffProfileId: uuidSchema.optional(),
  reason: z.string().max(500).optional(),
});

// ============================================
// AVAILABILITY QUERY SCHEMAS
// ============================================

/**
 * Availability query schema (public)
 */
export const availabilityQuerySchema = z.object({
  locationId: uuidSchema.optional(),
  serviceId: uuidSchema,
  staffProfileId: uuidSchema.optional(), // If not provided, return any_available
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional(),
  customerTimezone: timezoneSchema.optional(),
});

/**
 * Availability query schema (business)
 */
export const businessAvailabilityQuerySchema = availabilityQuerySchema.extend({
  includeUnavailable: z.boolean().optional(),
  includeHolds: z.boolean().optional(),
});

// ============================================
// MANAGEMENT TOKEN SCHEMAS
// ============================================

/**
 * Management token schema
 */
export const managementTokenSchema = z.object({
  token: z.string().min(1).max(100),
});

// ============================================
// IDempotency SCHEMAS
// ============================================

/**
 * Idempotency key schema
 */
export const idempotencyKeySchema = z.string().min(1).max(100);

// ============================================
// SUBSCRIPTION SCHEMAS
// ============================================

/**
 * Subscription plan schema
 */
export const subscriptionPlanSchema = z.object({
  planKey: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priceMinor: z.number().int().min(0),
  currency: currencySchema,
  billingInterval: z.enum(['month', 'year']),
  trialDays: z.number().int().min(0).optional(),
});

// ============================================
// WEBHOOK SCHEMAS
// ============================================

/**
 * Clerk webhook schema
 */
export const clerkWebhookSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.unknown()),
  object: z.string(),
  created: z.number().int(),
});

/**
 * Stripe webhook schema
 */
export const stripeWebhookSchema = z.object({
  id: z.string(),
  object: z.string(),
  api_version: z.string(),
  created: z.number().int(),
  data: z.object({
    object: z.record(z.unknown()),
  }),
  livemode: z.boolean(),
  pending_webhooks: z.number().int(),
  request: z.record(z.unknown()),
  type: z.string(),
});

// ============================================
// EXPORT ALL SCHEMAS
// ============================================

export const schemas = {
  // Common
  uuidSchema,
  isoDateTimeSchema,
  isoDateSchema,
  timezoneSchema,
  currencySchema,
  phoneE164Schema,
  emailSchema,
  paginationSchema,
  sortSchema,
  
  // Business
  businessSlugSchema,
  businessTypeSchema,
  businessStatusSchema,
  createBusinessSchema,
  updateBusinessSchema,
  businessSettingsSchema,
  
  // Location
  addressSchema,
  locationSchema,
  createLocationSchema,
  updateLocationSchema,
  
  // Staff
  staffProfileSchema,
  createStaffProfileSchema,
  updateStaffProfileSchema,
  
  // Service
  serviceSchema,
  createServiceSchema,
  updateServiceSchema,
  serviceCategorySchema,
  createServiceCategorySchema,
  staffServiceSchema,
  
  // Availability
  dayOfWeekSchema,
  timeSchema,
  availabilityRuleSchema,
  createAvailabilityRuleSchema,
  availabilityExceptionTypeSchema,
  availabilityExceptionSchema,
  createAvailabilityExceptionSchema,
  
  // Customer
  customerSchema,
  createCustomerSchema,
  updateCustomerSchema,
  customerSearchSchema,
  
  // Booking
  bookingSourceSchema,
  bookingStatusSchema,
  createBookingSchema,
  createManualBookingSchema,
  updateBookingSchema,
  bookingStatusChangeSchema,
  cancelBookingSchema,
  rescheduleBookingSchema,
  
  // Availability Query
  availabilityQuerySchema,
  businessAvailabilityQuerySchema,
  
  // Management
  managementTokenSchema,
  
  // Idempotency
  idempotencyKeySchema,
  
  // Subscription
  subscriptionPlanSchema,
  
  // Webhooks
  clerkWebhookSchema,
  stripeWebhookSchema,
};

// Export validation utility
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const fieldErrors = result.error.errors.map(error => ({
      field: error.path.join('.'),
      code: error.code,
      message: error.message,
      expected: error.expected?.toString(),
      received: error.received?.toString(),
    }));
    
    throw new Error(JSON.stringify({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Validation failed',
      fieldErrors,
    }));
  }
  
  return result.data;
}

export default schemas;