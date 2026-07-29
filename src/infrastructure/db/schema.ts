import {
  pgTable,
  pgSchema,
  uuid,
  text,
  citext,
  timestamp,
  date,
  time,
  boolean,
  integer,
  jsonb,
  char,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ============================================
// ENUMS
// ============================================

// Business status
export const businessStatusEnum = pgSchema('public').enum('business_status', [
  'draft',
  'active',
  'suspended',
  'cancelled',
]);

// Business user roles
export const businessUserRoleEnum = pgSchema('public').enum('business_user_role', [
  'owner',
  'manager',
  'receptionist',
]);

// Business user status
export const businessUserStatusEnum = pgSchema('public').enum('business_user_status', [
  'active',
  'invited',
  'disabled',
]);

// Booking status
export const bookingStatusEnum = pgSchema('public').enum('booking_status', [
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

// Booking source
export const bookingSourceEnum = pgSchema('public').enum('booking_source', [
  'phone',
  'walk_in',
  'admin',
  'import',
  'public',
]);

// Availability exception types
export const availabilityExceptionTypeEnum = pgSchema('public').enum('availability_exception_type', [
  'closed',
  'open_override',
  'break',
  'leave',
  'manual_block',
]);

// Day of week enum (0-6, Sunday = 0)
export const dayOfWeekEnum = pgSchema('public').enum('day_of_week', [
  '0', '1', '2', '3', '4', '5', '6',
]);

// Platform admin roles
export const platformAdminRoleEnum = pgSchema('public').enum('platform_admin_role', [
  'platform_owner',
  'platform_admin',
  'platform_support',
]);

// Platform admin status
export const platformAdminStatusEnum = pgSchema('public').enum('platform_admin_status', [
  'active',
  'disabled',
]);

// Notification delivery status
export const notificationDeliveryStatusEnum = pgSchema('public').enum('notification_delivery_status', [
  'queued',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'suppressed',
]);

// Outbox event status
export const outboxEventStatusEnum = pgSchema('public').enum('outbox_event_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'dead',
]);

// Webhook processing status
export const webhookProcessingStatusEnum = pgSchema('public').enum('webhook_processing_status', [
  'pending',
  'processed',
  'failed',
  'skipped',
]);

// Actor types for audit events
export const actorTypeEnum = pgSchema('public').enum('actor_type', [
  'platform_admin',
  'business_user',
  'customer',
  'system',
  'webhook',
]);

// ============================================
// TABLES
// ============================================

// Businesses table (tenant root)
export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalAuthOrgId: text('external_auth_org_id').unique(),
  name: text('name').notNull(),
  slug: citext('slug').notNull().unique(),
  businessType: text('business_type').notNull().default('salon'),
  status: businessStatusEnum('status').notNull().default('draft'),
  timezone: text('timezone').notNull(), // IANA timezone
  currency: char('currency', { length: 3 }).notNull(), // ISO 4217
  locale: text('locale').notNull().default('en-GB'),
  email: citext('email').notNull(),
  phoneE164: text('phone_e164').notNull(),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color'),
  accentColor: text('accent_color'),
  bookingPagePublished: boolean('booking_page_published').notNull().default(false),
  bookingHorizonDays: integer('booking_horizon_days').notNull().default(60),
  minimumNoticeMinutes: integer('minimum_notice_minutes').notNull().default(60),
  cancellationNoticeMinutes: integer('cancellation_notice_minutes').notNull().default(1440),
  slotIncrementMinutes: integer('slot_increment_minutes').notNull().default(15),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    slugIdx: uniqueIndex('businesses_slug_idx').on(table.slug),
    externalAuthOrgIdIdx: uniqueIndex('businesses_external_auth_org_id_idx').on(table.externalAuthOrgId),
    statusIdx: index('businesses_status_idx').on(table.status),
    createdAtIdx: index('businesses_created_at_idx').on(table.createdAt),
  };
});

// Business users (authenticated users linked to businesses)
export const businessUsers = pgTable('business_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  externalAuthUserId: text('external_auth_user_id').notNull(),
  role: businessUserRoleEnum('role').notNull().default('owner'),
  status: businessUserStatusEnum('status').notNull().default('active'),
  email: citext('email').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessUserIdx: uniqueIndex('business_users_business_user_idx').on(
      table.businessId,
      table.externalAuthUserId
    ),
    businessIdIdx: index('business_users_business_id_idx').on(table.businessId),
    externalAuthUserIdIdx: index('business_users_external_auth_user_id_idx').on(
      table.externalAuthUserId
    ),
  };
});

// Locations
export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  city: text('city'),
  region: text('region'),
  postalCode: text('postal_code'),
  countryCode: char('country_code', { length: 2 }).notNull().default('GB'),
  timezoneOverride: text('timezone_override'),
  phoneE164: text('phone_e164'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  isPrimary: boolean('is_primary').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  isVirtual: boolean('is_virtual').notNull().default(false),
  publicInstructions: text('public_instructions'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('locations_business_id_idx').on(table.businessId),
    businessIdPrimaryIdx: uniqueIndex('locations_business_id_primary_idx').on(
      table.businessId,
      table.isPrimary
    ).where(table.isPrimary.eq(true)),
    isActiveIdx: index('locations_is_active_idx').on(table.isActive),
  };
});

// Staff profiles
export const staffProfiles = pgTable('staff_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  businessUserId: uuid('business_user_id'), // Nullable for MVP, will link to business_users.id in future
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  photoUrl: text('photo_url'),
  isActive: boolean('is_active').notNull().default(true),
  isPublic: boolean('is_public').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  internalNotes: text('internal_notes'),
  color: text('color'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('staff_profiles_business_id_idx').on(table.businessId),
    locationIdIdx: index('staff_profiles_location_id_idx').on(table.locationId),
    businessUserIdIdx: index('staff_profiles_business_user_id_idx').on(table.businessUserId),
    isActiveIdx: index('staff_profiles_is_active_idx').on(table.isActive),
    isPublicIdx: index('staff_profiles_is_public_idx').on(table.isPublic),
  };
});

// Service categories
export const serviceCategories = pgTable('service_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('service_categories_business_id_idx').on(table.businessId),
    isActiveIdx: index('service_categories_is_active_idx').on(table.isActive),
  };
});

// Services
export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  categoryId: uuid('category_id').references(() => serviceCategories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  prepBufferMinutes: integer('prep_buffer_minutes').notNull().default(0),
  cleanupBufferMinutes: integer('cleanup_buffer_minutes').notNull().default(0),
  priceMinor: integer('price_minor').notNull().default(0), // Price in minor currency units (e.g., pence for GBP)
  currency: char('currency', { length: 3 }).notNull().default('GBP'),
  minimumNoticeMinutesOverride: integer('minimum_notice_minutes_override'),
  bookingHorizonDaysOverride: integer('booking_horizon_days_override'),
  isActive: boolean('is_active').notNull().default(true),
  isPublic: boolean('is_public').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('services_business_id_idx').on(table.businessId),
    locationIdIdx: index('services_location_id_idx').on(table.locationId),
    categoryIdIdx: index('services_category_id_idx').on(table.categoryId),
    isActiveIdx: index('services_is_active_idx').on(table.isActive),
    isPublicIdx: index('services_is_public_idx').on(table.isPublic),
  };
});

// Staff services (many-to-many relationship)
export const staffServices = pgTable('staff_services', {
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  staffProfileId: uuid('staff_profile_id').references(() => staffProfiles.id, { onDelete: 'cascade' }).notNull(),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
  durationOverrideMinutes: integer('duration_override_minutes'),
  priceOverrideMinor: integer('price_override_minor'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.staffProfileId, table.serviceId] }),
    businessIdIdx: index('staff_services_business_id_idx').on(table.businessId),
    staffProfileIdIdx: index('staff_services_staff_profile_id_idx').on(table.staffProfileId),
    serviceIdIdx: index('staff_services_service_id_idx').on(table.serviceId),
  };
});

// Resources (e.g., rooms, chairs, equipment)
export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  resourceType: text('resource_type').notNull(),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('resources_business_id_idx').on(table.businessId),
    locationIdIdx: index('resources_location_id_idx').on(table.locationId),
    resourceTypeIdx: index('resources_resource_type_idx').on(table.resourceType),
    isActiveIdx: index('resources_is_active_idx').on(table.isActive),
  };
});

// Service resource requirements
export const serviceResourceRequirements = pgTable('service_resource_requirements', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'cascade' }),
  resourceType: text('resource_type'),
  quantity: integer('quantity').notNull().default(1),
  required: boolean('required').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('service_resource_requirements_business_id_idx').on(table.businessId),
    serviceIdIdx: index('service_resource_requirements_service_id_idx').on(table.serviceId),
    resourceIdIdx: index('service_resource_requirements_resource_id_idx').on(table.resourceId),
  };
});

// Availability rules
export const availabilityRules = pgTable('availability_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  staffProfileId: uuid('staff_profile_id').references(() => staffProfiles.id, { onDelete: 'set null' }),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
  dayOfWeek: dayOfWeekEnum('day_of_week').notNull(),
  localStartTime: time('local_start_time').notNull(),
  localEndTime: time('local_end_time').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveUntil: date('effective_until'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('availability_rules_business_id_idx').on(table.businessId),
    locationIdIdx: index('availability_rules_location_id_idx').on(table.locationId),
    staffProfileIdIdx: index('availability_rules_staff_profile_id_idx').on(table.staffProfileId),
    resourceIdIdx: index('availability_rules_resource_id_idx').on(table.resourceId),
    dayOfWeekIdx: index('availability_rules_day_of_week_idx').on(table.dayOfWeek),
    isActiveIdx: index('availability_rules_is_active_idx').on(table.isActive),
    // Composite index for common queries
    subjectDayIdx: index('availability_rules_subject_day_idx').on(
      table.businessId,
      table.locationId,
      table.staffProfileId,
      table.resourceId,
      table.dayOfWeek
    ),
  };
});

// Availability exceptions
export const availabilityExceptions = pgTable('availability_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  staffProfileId: uuid('staff_profile_id').references(() => staffProfiles.id, { onDelete: 'set null' }),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
  exceptionType: availabilityExceptionTypeEnum('exception_type').notNull(),
  startsAt: timestamp('starts_at', { mode: 'date' }).notNull(),
  endsAt: timestamp('ends_at', { mode: 'date' }).notNull(),
  reason: text('reason'),
  createdByBusinessUserId: uuid('created_by_business_user_id').references(() => businessUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('availability_exceptions_business_id_idx').on(table.businessId),
    locationIdIdx: index('availability_exceptions_location_id_idx').on(table.locationId),
    staffProfileIdIdx: index('availability_exceptions_staff_profile_id_idx').on(table.staffProfileId),
    resourceIdIdx: index('availability_exceptions_resource_id_idx').on(table.resourceId),
    exceptionTypeIdx: index('availability_exceptions_exception_type_idx').on(table.exceptionType),
    dateRangeIdx: index('availability_exceptions_date_range_idx').on(
      table.startsAt,
      table.endsAt
    ),
  };
});

// Customers
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  displayName: text('display_name').notNull(),
  email: citext('email'),
  emailNormalized: citext('email_normalized'),
  phoneE164: text('phone_e164'),
  internalNotes: text('internal_notes'),
  marketingEmailConsent: boolean('marketing_email_consent').notNull().default(false),
  marketingSmsConsent: boolean('marketing_sms_consent').notNull().default(false),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdEmailIdx: uniqueIndex('customers_business_id_email_idx').on(
      table.businessId,
      table.emailNormalized
    ).where(table.deletedAt.isNull()),
    businessIdPhoneIdx: uniqueIndex('customers_business_id_phone_idx').on(
      table.businessId,
      table.phoneE164
    ).where(table.deletedAt.isNull()),
    businessIdIdx: index('customers_business_id_idx').on(table.businessId),
    emailNormalizedIdx: index('customers_email_normalized_idx').on(table.emailNormalized),
    phoneE164Idx: index('customers_phone_e164_idx').on(table.phoneE164),
    deletedAtIdx: index('customers_deleted_at_idx').on(table.deletedAt),
  };
});

// Bookings
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  publicReference: text('public_reference').notNull().unique(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
  staffProfileId: uuid('staff_profile_id').references(() => staffProfiles.id, { onDelete: 'set null' }),
  status: bookingStatusEnum('status').notNull().default('confirmed'),
  source: bookingSourceEnum('source').notNull().default('public'),
  startsAt: timestamp('starts_at', { mode: 'date' }).notNull(),
  endsAt: timestamp('ends_at', { mode: 'date' }).notNull(),
  occupiedRange: pgSchema('public').range('occupied_range').notNull(), // tstzrange
  customerTimezone: text('customer_timezone'),
  customerNote: text('customer_note'),
  internalNote: text('internal_note'),
  // Snapshots for historical accuracy
  serviceNameSnapshot: text('service_name_snapshot'),
  serviceDurationSnapshot: integer('service_duration_snapshot'),
  servicePriceSnapshot: integer('service_price_snapshot'),
  serviceCurrencySnapshot: char('service_currency_snapshot', { length: 3 }),
  staffNameSnapshot: text('staff_name_snapshot'),
  locationNameSnapshot: text('location_name_snapshot'),
  locationAddressSnapshot: text('location_address_snapshot'),
  policyVersion: text('policy_version'),
  cancelledAt: timestamp('cancelled_at', { mode: 'date' }),
  cancellationReason: text('cancellation_reason'),
  rescheduledFromBookingId: uuid('rescheduled_from_booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  createdByBusinessUserId: uuid('created_by_business_user_id').references(() => businessUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('bookings_business_id_idx').on(table.businessId),
    publicReferenceIdx: uniqueIndex('bookings_public_reference_idx').on(table.publicReference),
    customerIdIdx: index('bookings_customer_id_idx').on(table.customerId),
    serviceIdIdx: index('bookings_service_id_idx').on(table.serviceId),
    staffProfileIdIdx: index('bookings_staff_profile_id_idx').on(table.staffProfileId),
    locationIdIdx: index('bookings_location_id_idx').on(table.locationId),
    statusIdx: index('bookings_status_idx').on(table.status),
    startsAtIdx: index('bookings_starts_at_idx').on(table.startsAt),
    endsAtIdx: index('bookings_ends_at_idx').on(table.endsAt),
    occupiedRangeIdx: index('bookings_occupied_range_idx').using('gist').on(table.occupiedRange),
    createdAtIdx: index('bookings_created_at_idx').on(table.createdAt),
    // Composite index for common queries
    businessDateRangeIdx: index('bookings_business_date_range_idx').on(
      table.businessId,
      table.startsAt,
      table.endsAt
    ),
  };
});

// Booking resources (allocation of resources to bookings)
export const bookingResources = pgTable('booking_resources', {
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'cascade' }).notNull(),
  occupiedRange: pgSchema('public').range('occupied_range').notNull(), // tstzrange
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.bookingId, table.resourceId] }),
    businessIdIdx: index('booking_resources_business_id_idx').on(table.businessId),
    bookingIdIdx: index('booking_resources_booking_id_idx').on(table.bookingId),
    resourceIdIdx: index('booking_resources_resource_id_idx').on(table.resourceId),
    occupiedRangeIdx: index('booking_resources_occupied_range_idx').using('gist').on(table.occupiedRange),
  };
});

// Booking status events (audit trail for booking status changes)
export const bookingStatusEvents = pgTable('booking_status_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  fromStatus: bookingStatusEnum('from_status').notNull(),
  toStatus: bookingStatusEnum('to_status').notNull(),
  actorType: actorTypeEnum('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  reason: text('reason'),
  correlationId: text('correlation_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('booking_status_events_business_id_idx').on(table.businessId),
    bookingIdIdx: index('booking_status_events_booking_id_idx').on(table.bookingId),
    createdAtIdx: index('booking_status_events_created_at_idx').on(table.createdAt),
    // Composite index for common queries
    bookingStatusIdx: index('booking_status_events_booking_status_idx').on(
      table.bookingId,
      table.createdAt
    ),
  };
});

// Booking holds (temporary reservations)
export const bookingHolds = pgTable('booking_holds', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  staffProfileId: uuid('staff_profile_id').references(() => staffProfiles.id, { onDelete: 'set null' }),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
  occupiedRange: pgSchema('public').range('occupied_range').notNull(), // tstzrange
  customerPayloadEncrypted: text('customer_payload_encrypted'),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  idempotencyKey: text('idempotency_key').unique(),
  paymentProviderId: text('payment_provider_id'),
  paymentIntentId: text('payment_intent_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('booking_holds_business_id_idx').on(table.businessId),
    idempotencyKeyIdx: uniqueIndex('booking_holds_idempotency_key_idx').on(table.idempotencyKey),
    expiresAtIdx: index('booking_holds_expires_at_idx').on(table.expiresAt),
    occupiedRangeIdx: index('booking_holds_occupied_range_idx').using('gist').on(table.occupiedRange),
    statusIdx: index('booking_holds_status_idx').on(table.status),
  };
});

// Booking management tokens
export const bookingManagementTokens = pgTable('booking_management_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  revokedAt: timestamp('revoked_at', { mode: 'date' }),
  lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('booking_management_tokens_business_id_idx').on(table.businessId),
    bookingIdIdx: index('booking_management_tokens_booking_id_idx').on(table.bookingId),
    tokenHashIdx: uniqueIndex('booking_management_tokens_token_hash_idx').on(table.tokenHash),
    expiresAtIdx: index('booking_management_tokens_expires_at_idx').on(table.expiresAt),
  };
});

// Subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  planKey: text('plan_key').notNull(),
  billingStatus: text('billing_status').notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start', { mode: 'date' }),
  currentPeriodEnd: timestamp('current_period_end', { mode: 'date' }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: uniqueIndex('subscriptions_business_id_idx').on(table.businessId),
    stripeSubscriptionIdIdx: uniqueIndex('subscriptions_stripe_subscription_id_idx').on(
      table.stripeSubscriptionId
    ),
    stripeCustomerIdIdx: index('subscriptions_stripe_customer_id_idx').on(table.stripeCustomerId),
    planKeyIdx: index('subscriptions_plan_key_idx').on(table.planKey),
    billingStatusIdx: index('subscriptions_billing_status_idx').on(table.billingStatus),
  };
});

// Entitlements
export const entitlements = pgTable('entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  featureKey: text('feature_key').notNull(),
  value: text('value').notNull(),
  source: text('source').notNull(), // 'plan', 'override', 'pilot'
  validFrom: timestamp('valid_from', { mode: 'date' }).notNull(),
  validUntil: timestamp('valid_until', { mode: 'date' }),
  reason: text('reason'),
  actor: text('actor'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdFeatureKeyIdx: uniqueIndex('entitlements_business_id_feature_key_idx').on(
      table.businessId,
      table.featureKey,
      table.source
    ),
    businessIdIdx: index('entitlements_business_id_idx').on(table.businessId),
    featureKeyIdx: index('entitlements_feature_key_idx').on(table.featureKey),
    validFromIdx: index('entitlements_valid_from_idx').on(table.validFrom),
    validUntilIdx: index('entitlements_valid_until_idx').on(table.validUntil),
  };
});

// Payments (Phase C)
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(), // 'stripe'
  providerPaymentIntentId: text('provider_payment_intent_id'),
  providerChargeId: text('provider_charge_id'),
  providerRefundId: text('provider_refund_id'),
  amountMinor: integer('amount_minor').notNull(), // Amount in minor currency units
  currency: char('currency', { length: 3 }).notNull(),
  status: text('status').notNull(), // 'pending', 'succeeded', 'failed', 'refunded'
  refundableAmountMinor: integer('refundable_amount_minor').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('payments_business_id_idx').on(table.businessId),
    bookingIdIdx: index('payments_booking_id_idx').on(table.bookingId),
    providerPaymentIntentIdIdx: uniqueIndex('payments_provider_payment_intent_id_idx').on(
      table.providerPaymentIntentId
    ),
    statusIdx: index('payments_status_idx').on(table.status),
    createdAtIdx: index('payments_created_at_idx').on(table.createdAt),
  };
});

// Outbox events
export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  payload: jsonb('payload').notNull(),
  status: outboxEventStatusEnum('status').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { mode: 'date' }),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('outbox_events_business_id_idx').on(table.businessId),
    statusIdx: index('outbox_events_status_idx').on(table.status),
    nextAttemptAtIdx: index('outbox_events_next_attempt_at_idx').on(table.nextAttemptAt),
    createdAtIdx: index('outbox_events_created_at_idx').on(table.createdAt),
    // Composite index for processing
    processIdx: index('outbox_events_process_idx').on(
      table.status,
      table.nextAttemptAt
    ),
  };
});

// Webhook events
export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(), // 'clerk', 'stripe', etc.
  providerEventId: text('provider_event_id').notNull(),
  eventType: text('event_type').notNull(),
  payloadHash: text('payload_hash').notNull(),
  processingStatus: webhookProcessingStatusEnum('processing_status').notNull().default('pending'),
  processedAt: timestamp('processed_at', { mode: 'date' }),
  failureReason: text('failure_reason'),
  failureCount: integer('failure_count').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    providerEventIdIdx: uniqueIndex('webhook_events_provider_event_id_idx').on(
      table.provider,
      table.providerEventId
    ),
    providerIdx: index('webhook_events_provider_idx').on(table.provider),
    eventTypeIdx: index('webhook_events_event_type_idx').on(table.eventType),
    processingStatusIdx: index('webhook_events_processing_status_idx').on(table.processingStatus),
    createdAtIdx: index('webhook_events_created_at_idx').on(table.createdAt),
  };
});

// Idempotency records
export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorType: text('actor_type').notNull(), // 'business', 'customer', 'system'
  actorId: uuid('actor_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status').notNull(),
  responseBody: jsonb('response_body'),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    actorIdempotencyKeyIdx: uniqueIndex('idempotency_records_actor_idempotency_key_idx').on(
      table.actorType,
      table.actorId,
      table.idempotencyKey
    ),
    idempotencyKeyIdx: index('idempotency_records_idempotency_key_idx').on(table.idempotencyKey),
    expiresAtIdx: index('idempotency_records_expires_at_idx').on(table.expiresAt),
    createdAtIdx: index('idempotency_records_created_at_idx').on(table.createdAt),
  };
});

// Audit events
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
  actorType: actorTypeEnum('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  reason: text('reason'),
  metadata: jsonb('metadata'),
  ipHash: text('ip_hash'),
  correlationId: text('correlation_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('audit_events_business_id_idx').on(table.businessId),
    actorTypeActorIdIdx: index('audit_events_actor_type_actor_id_idx').on(
      table.actorType,
      table.actorId
    ),
    targetTypeTargetIdIdx: index('audit_events_target_type_target_id_idx').on(
      table.targetType,
      table.targetId
    ),
    actionIdx: index('audit_events_action_idx').on(table.action),
    createdAtIdx: index('audit_events_created_at_idx').on(table.createdAt),
    correlationIdIdx: index('audit_events_correlation_id_idx').on(table.correlationId),
  };
});

// Platform admins
export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalAuthUserId: text('external_auth_user_id').notNull().unique(),
  email: citext('email').notNull(),
  role: platformAdminRoleEnum('role').notNull().default('platform_admin'),
  status: platformAdminStatusEnum('status').notNull().default('active'),
  mfaVerifiedAt: timestamp('mfa_verified_at', { mode: 'date' }),
  createdByPlatformAdminId: uuid('created_by_platform_admin_id').references(() => platformAdmins.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    externalAuthUserIdIdx: uniqueIndex('platform_admins_external_auth_user_id_idx').on(
      table.externalAuthUserId
    ),
    emailIdx: uniqueIndex('platform_admins_email_idx').on(table.email),
    roleIdx: index('platform_admins_role_idx').on(table.role),
    statusIdx: index('platform_admins_status_idx').on(table.status),
  };
});

// Booking policies
export const bookingPolicies = pgTable('booking_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull(),
  minimumNoticeMinutes: integer('minimum_notice_minutes').notNull(),
  bookingHorizonDays: integer('booking_horizon_days').notNull(),
  cancellationNoticeMinutes: integer('cancellation_notice_minutes').notNull(),
  reschedulingNoticeMinutes: integer('rescheduling_notice_minutes'),
  cancellationPolicyText: text('cancellation_policy_text'),
  termsText: text('terms_text'),
  isActive: boolean('is_active').notNull().default(false),
  effectiveFrom: timestamp('effective_from', { mode: 'date' }).notNull(),
  createdByBusinessUserId: uuid('created_by_business_user_id').references(() => businessUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdVersionIdx: uniqueIndex('booking_policies_business_id_version_idx').on(
      table.businessId,
      table.version
    ),
    businessIdIdx: index('booking_policies_business_id_idx').on(table.businessId),
    isActiveIdx: index('booking_policies_is_active_idx').on(table.isActive),
    effectiveFromIdx: index('booking_policies_effective_from_idx').on(table.effectiveFrom),
  };
});

// Business support notes
export const businessSupportNotes = pgTable('business_support_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  platformAdminId: uuid('platform_admin_id').references(() => platformAdmins.id, { onDelete: 'set null' }).notNull(),
  note: text('note').notNull(),
  visibility: text('visibility').notNull().default('internal_only'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('business_support_notes_business_id_idx').on(table.businessId),
    platformAdminIdIdx: index('business_support_notes_platform_admin_id_idx').on(
      table.platformAdminId
    ),
    createdAtIdx: index('business_support_notes_created_at_idx').on(table.createdAt),
  };
});

// Notification deliveries
export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  outboxEventId: uuid('outbox_event_id').references(() => outboxEvents.id, { onDelete: 'set null' }),
  channel: text('channel').notNull(), // 'email', 'sms', 'whatsapp'
  recipientHash: text('recipient_hash').notNull(),
  providerMessageId: text('provider_message_id'),
  templateKey: text('template_key'),
  templateVersion: text('template_version'),
  status: notificationDeliveryStatusEnum('status').notNull().default('queued'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),
  sentAt: timestamp('sent_at', { mode: 'date' }),
  deliveredAt: timestamp('delivered_at', { mode: 'date' }),
  bouncedAt: timestamp('bounced_at', { mode: 'date' }),
  failedAt: timestamp('failed_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => {
  return {
    businessIdIdx: index('notification_deliveries_business_id_idx').on(table.businessId),
    bookingIdIdx: index('notification_deliveries_booking_id_idx').on(table.bookingId),
    outboxEventIdIdx: index('notification_deliveries_outbox_event_id_idx').on(
      table.outboxEventId
    ),
    channelIdx: index('notification_deliveries_channel_idx').on(table.channel),
    statusIdx: index('notification_deliveries_status_idx').on(table.status),
    recipientHashIdx: index('notification_deliveries_recipient_hash_idx').on(
      table.recipientHash
    ),
    createdAtIdx: index('notification_deliveries_created_at_idx').on(table.createdAt),
    // Composite index for processing
    processIdx: index('notification_deliveries_process_idx').on(
      table.status,
      table.attemptCount,
      table.createdAt
    ),
  };
});

// Export all tables for use in the application
export const allTables = {
  businesses,
  businessUsers,
  locations,
  staffProfiles,
  serviceCategories,
  services,
  staffServices,
  resources,
  serviceResourceRequirements,
  availabilityRules,
  availabilityExceptions,
  customers,
  bookings,
  bookingResources,
  bookingStatusEvents,
  bookingHolds,
  bookingManagementTokens,
  subscriptions,
  entitlements,
  payments,
  outboxEvents,
  webhookEvents,
  idempotencyRecords,
  auditEvents,
  platformAdmins,
  bookingPolicies,
  businessSupportNotes,
  notificationDeliveries,
};

// Export all enums for use in the application
export const allEnums = {
  businessStatusEnum,
  businessUserRoleEnum,
  businessUserStatusEnum,
  bookingStatusEnum,
  bookingSourceEnum,
  availabilityExceptionTypeEnum,
  dayOfWeekEnum,
  platformAdminRoleEnum,
  platformAdminStatusEnum,
  notificationDeliveryStatusEnum,
  outboxEventStatusEnum,
  webhookProcessingStatusEnum,
  actorTypeEnum,
};

export default allTables;