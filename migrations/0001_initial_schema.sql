-- Migration: 0001_initial_schema
-- Description: Initial database schema for Multi-Tenant Booking Platform
-- Created: 2026-07-29
-- Author: Codex

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================
-- ENUMS
-- ============================================

-- Business status
CREATE TYPE business_status AS ENUM (
  'draft',
  'active',
  'suspended',
  'cancelled'
);

-- Business user roles
CREATE TYPE business_user_role AS ENUM (
  'owner',
  'manager',
  'receptionist'
);

-- Business user status
CREATE TYPE business_user_status AS ENUM (
  'active',
  'invited',
  'disabled'
);

-- Booking status
CREATE TYPE booking_status AS ENUM (
  'draft',
  'pending_payment',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled_by_customer',
  'cancelled_by_business',
  'no_show',
  'rescheduled',
  'expired'
);

-- Booking source
CREATE TYPE booking_source AS ENUM (
  'phone',
  'walk_in',
  'admin',
  'import',
  'public'
);

-- Availability exception types
CREATE TYPE availability_exception_type AS ENUM (
  'closed',
  'open_override',
  'break',
  'leave',
  'manual_block'
);

-- Day of week (0-6, Sunday = 0)
CREATE TYPE day_of_week AS ENUM (
  '0', '1', '2', '3', '4', '5', '6'
);

-- Platform admin roles
CREATE TYPE platform_admin_role AS ENUM (
  'platform_owner',
  'platform_admin',
  'platform_support'
);

-- Platform admin status
CREATE TYPE platform_admin_status AS ENUM (
  'active',
  'disabled'
);

-- Notification delivery status
CREATE TYPE notification_delivery_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'suppressed'
);

-- Outbox event status
CREATE TYPE outbox_event_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'dead'
);

-- Webhook processing status
CREATE TYPE webhook_processing_status AS ENUM (
  'pending',
  'processed',
  'failed',
  'skipped'
);

-- Actor types for audit events
CREATE TYPE actor_type AS ENUM (
  'platform_admin',
  'business_user',
  'customer',
  'system',
  'webhook'
);

-- ============================================
-- TABLES
-- ============================================

-- Businesses table (tenant root)
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_auth_org_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug CITEXT UNIQUE NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'salon',
  status business_status NOT NULL DEFAULT 'draft',
  timezone TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en-GB',
  email CITEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  accent_color TEXT,
  booking_page_published BOOLEAN NOT NULL DEFAULT false,
  booking_horizon_days INTEGER NOT NULL DEFAULT 60,
  minimum_notice_minutes INTEGER NOT NULL DEFAULT 60,
  cancellation_notice_minutes INTEGER NOT NULL DEFAULT 1440,
  slot_increment_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business users (authenticated users linked to businesses)
CREATE TABLE business_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  external_auth_user_id TEXT NOT NULL,
  role business_user_role NOT NULL DEFAULT 'owner',
  status business_user_status NOT NULL DEFAULT 'active',
  email CITEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, external_auth_user_id)
);

-- Locations
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'GB',
  timezone_override TEXT,
  phone_e164 TEXT,
  latitude TEXT,
  longitude TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_virtual BOOLEAN NOT NULL DEFAULT false,
  public_instructions TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff profiles
CREATE TABLE staff_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  business_user_id UUID,
  display_name TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  internal_notes TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service categories
CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Services
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  prep_buffer_minutes INTEGER NOT NULL DEFAULT 0,
  cleanup_buffer_minutes INTEGER NOT NULL DEFAULT 0,
  price_minor INTEGER NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  minimum_notice_minutes_override INTEGER,
  booking_horizon_days_override INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff services (many-to-many relationship)
CREATE TABLE staff_services (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  duration_override_minutes INTEGER,
  price_override_minor INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staff_profile_id, service_id)
);

-- Resources (e.g., rooms, chairs, equipment)
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service resource requirements
CREATE TABLE service_resource_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  resource_type TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Availability rules
CREATE TABLE availability_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
  day_of_week day_of_week NOT NULL,
  local_start_time TIME NOT NULL,
  local_end_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Availability exceptions
CREATE TABLE availability_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
  exception_type availability_exception_type NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by_business_user_id UUID REFERENCES business_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email CITEXT,
  email_normalized CITEXT,
  phone_e164 TEXT,
  internal_notes TEXT,
  marketing_email_consent BOOLEAN NOT NULL DEFAULT false,
  marketing_sms_consent BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  public_reference TEXT NOT NULL UNIQUE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  status booking_status NOT NULL DEFAULT 'confirmed',
  source booking_source NOT NULL DEFAULT 'public',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  occupied_range TSTZRANGE NOT NULL,
  customer_timezone TEXT,
  customer_note TEXT,
  internal_note TEXT,
  service_name_snapshot TEXT,
  service_duration_snapshot INTEGER,
  service_price_snapshot INTEGER,
  service_currency_snapshot CHAR(3),
  staff_name_snapshot TEXT,
  location_name_snapshot TEXT,
  location_address_snapshot TEXT,
  policy_version TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  rescheduled_from_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_by_business_user_id UUID REFERENCES business_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Booking resources (allocation of resources to bookings)
CREATE TABLE booking_resources (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  occupied_range TSTZRANGE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (booking_id, resource_id)
);

-- Booking status events (audit trail for booking status changes)
CREATE TABLE booking_status_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status booking_status NOT NULL,
  to_status booking_status NOT NULL,
  actor_type actor_type NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Booking holds (temporary reservations)
CREATE TABLE booking_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
  occupied_range TSTZRANGE NOT NULL,
  customer_payload_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT UNIQUE,
  payment_provider_id TEXT,
  payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Booking management tokens
CREATE TABLE booking_management_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_key TEXT NOT NULL,
  billing_status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Entitlements
CREATE TABLE entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  reason TEXT,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payments (Phase C)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_payment_intent_id TEXT,
  provider_charge_id TEXT,
  provider_refund_id TEXT,
  amount_minor INTEGER NOT NULL,
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL,
  refundable_amount_minor INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Outbox events
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status outbox_event_status NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook events
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  processing_status webhook_processing_status NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_event_id)
);

-- Idempotency records
CREATE TABLE idempotency_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type TEXT NOT NULL,
  actor_id UUID,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_type, actor_id, idempotency_key)
);

-- Audit events
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  actor_type actor_type NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  metadata JSONB,
  ip_hash TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform admins
CREATE TABLE platform_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_auth_user_id TEXT NOT NULL UNIQUE,
  email CITEXT NOT NULL,
  role platform_admin_role NOT NULL DEFAULT 'platform_admin',
  status platform_admin_status NOT NULL DEFAULT 'active',
  mfa_verified_at TIMESTAMPTZ,
  created_by_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Booking policies
CREATE TABLE booking_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  minimum_notice_minutes INTEGER NOT NULL,
  booking_horizon_days INTEGER NOT NULL,
  cancellation_notice_minutes INTEGER NOT NULL,
  rescheduling_notice_minutes INTEGER,
  cancellation_policy_text TEXT,
  terms_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  effective_from TIMESTAMPTZ NOT NULL,
  created_by_business_user_id UUID REFERENCES business_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, version)
);

-- Business support notes
CREATE TABLE business_support_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform_admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification deliveries
CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  outbox_event_id UUID REFERENCES outbox_events(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  provider_message_id TEXT,
  template_key TEXT,
  template_version TEXT,
  status notification_delivery_status NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drizzle migrations tracking table
CREATE TABLE drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Businesses indexes
CREATE INDEX IF NOT EXISTS businesses_slug_idx ON businesses (slug);
CREATE INDEX IF NOT EXISTS businesses_external_auth_org_id_idx ON businesses (external_auth_org_id);
CREATE INDEX IF NOT EXISTS businesses_status_idx ON businesses (status);
CREATE INDEX IF NOT EXISTS businesses_created_at_idx ON businesses (created_at);

-- Business users indexes
CREATE INDEX IF NOT EXISTS business_users_business_id_idx ON business_users (business_id);
CREATE INDEX IF NOT EXISTS business_users_external_auth_user_id_idx ON business_users (external_auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS business_users_business_user_idx ON business_users (business_id, external_auth_user_id);

-- Locations indexes
CREATE INDEX IF NOT EXISTS locations_business_id_idx ON locations (business_id);
CREATE UNIQUE INDEX IF NOT EXISTS locations_business_id_primary_idx ON locations (business_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS locations_is_active_idx ON locations (is_active);

-- Staff profiles indexes
CREATE INDEX IF NOT EXISTS staff_profiles_business_id_idx ON staff_profiles (business_id);
CREATE INDEX IF NOT EXISTS staff_profiles_location_id_idx ON staff_profiles (location_id);
CREATE INDEX IF NOT EXISTS staff_profiles_business_user_id_idx ON staff_profiles (business_user_id);
CREATE INDEX IF NOT EXISTS staff_profiles_is_active_idx ON staff_profiles (is_active);
CREATE INDEX IF NOT EXISTS staff_profiles_is_public_idx ON staff_profiles (is_public);

-- Service categories indexes
CREATE INDEX IF NOT EXISTS service_categories_business_id_idx ON service_categories (business_id);
CREATE INDEX IF NOT EXISTS service_categories_is_active_idx ON service_categories (is_active);

-- Services indexes
CREATE INDEX IF NOT EXISTS services_business_id_idx ON services (business_id);
CREATE INDEX IF NOT EXISTS services_location_id_idx ON services (location_id);
CREATE INDEX IF NOT EXISTS services_category_id_idx ON services (category_id);
CREATE INDEX IF NOT EXISTS services_is_active_idx ON services (is_active);
CREATE INDEX IF NOT EXISTS services_is_public_idx ON services (is_public);

-- Staff services indexes
CREATE INDEX IF NOT EXISTS staff_services_business_id_idx ON staff_services (business_id);
CREATE INDEX IF NOT EXISTS staff_services_staff_profile_id_idx ON staff_services (staff_profile_id);
CREATE INDEX IF NOT EXISTS staff_services_service_id_idx ON staff_services (service_id);

-- Resources indexes
CREATE INDEX IF NOT EXISTS resources_business_id_idx ON resources (business_id);
CREATE INDEX IF NOT EXISTS resources_location_id_idx ON resources (location_id);
CREATE INDEX IF NOT EXISTS resources_resource_type_idx ON resources (resource_type);
CREATE INDEX IF NOT EXISTS resources_is_active_idx ON resources (is_active);

-- Service resource requirements indexes
CREATE INDEX IF NOT EXISTS service_resource_requirements_business_id_idx ON service_resource_requirements (business_id);
CREATE INDEX IF NOT EXISTS service_resource_requirements_service_id_idx ON service_resource_requirements (service_id);
CREATE INDEX IF NOT EXISTS service_resource_requirements_resource_id_idx ON service_resource_requirements (resource_id);

-- Availability rules indexes
CREATE INDEX IF NOT EXISTS availability_rules_business_id_idx ON availability_rules (business_id);
CREATE INDEX IF NOT EXISTS availability_rules_location_id_idx ON availability_rules (location_id);
CREATE INDEX IF NOT EXISTS availability_rules_staff_profile_id_idx ON availability_rules (staff_profile_id);
CREATE INDEX IF NOT EXISTS availability_rules_resource_id_idx ON availability_rules (resource_id);
CREATE INDEX IF NOT EXISTS availability_rules_day_of_week_idx ON availability_rules (day_of_week);
CREATE INDEX IF NOT EXISTS availability_rules_is_active_idx ON availability_rules (is_active);
CREATE INDEX IF NOT EXISTS availability_rules_subject_day_idx ON availability_rules (business_id, location_id, staff_profile_id, resource_id, day_of_week);

-- Availability exceptions indexes
CREATE INDEX IF NOT EXISTS availability_exceptions_business_id_idx ON availability_exceptions (business_id);
CREATE INDEX IF NOT EXISTS availability_exceptions_location_id_idx ON availability_exceptions (location_id);
CREATE INDEX IF NOT EXISTS availability_exceptions_staff_profile_id_idx ON availability_exceptions (staff_profile_id);
CREATE INDEX IF NOT EXISTS availability_exceptions_resource_id_idx ON availability_exceptions (resource_id);
CREATE INDEX IF NOT EXISTS availability_exceptions_exception_type_idx ON availability_exceptions (exception_type);
CREATE INDEX IF NOT EXISTS availability_exceptions_date_range_idx ON availability_exceptions (starts_at, ends_at);

-- Customers indexes
CREATE UNIQUE INDEX IF NOT EXISTS customers_business_id_email_idx ON customers (business_id, email_normalized) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_business_id_phone_idx ON customers (business_id, phone_e164) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS customers_business_id_idx ON customers (business_id);
CREATE INDEX IF NOT EXISTS customers_email_normalized_idx ON customers (email_normalized);
CREATE INDEX IF NOT EXISTS customers_phone_e164_idx ON customers (phone_e164);
CREATE INDEX IF NOT EXISTS customers_deleted_at_idx ON customers (deleted_at);

-- Bookings indexes
CREATE INDEX IF NOT EXISTS bookings_business_id_idx ON bookings (business_id);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_public_reference_idx ON bookings (public_reference);
CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON bookings (customer_id);
CREATE INDEX IF NOT EXISTS bookings_service_id_idx ON bookings (service_id);
CREATE INDEX IF NOT EXISTS bookings_staff_profile_id_idx ON bookings (staff_profile_id);
CREATE INDEX IF NOT EXISTS bookings_location_id_idx ON bookings (location_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);
CREATE INDEX IF NOT EXISTS bookings_starts_at_idx ON bookings (starts_at);
CREATE INDEX IF NOT EXISTS bookings_ends_at_idx ON bookings (ends_at);
CREATE INDEX IF NOT EXISTS bookings_occupied_range_idx ON bookings USING GIST (occupied_range);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings (created_at);
CREATE INDEX IF NOT EXISTS bookings_business_date_range_idx ON bookings (business_id, starts_at, ends_at);

-- Booking resources indexes
CREATE INDEX IF NOT EXISTS booking_resources_business_id_idx ON booking_resources (business_id);
CREATE INDEX IF NOT EXISTS booking_resources_booking_id_idx ON booking_resources (booking_id);
CREATE INDEX IF NOT EXISTS booking_resources_resource_id_idx ON booking_resources (resource_id);
CREATE INDEX IF NOT EXISTS booking_resources_occupied_range_idx ON booking_resources USING GIST (occupied_range);

-- Booking status events indexes
CREATE INDEX IF NOT EXISTS booking_status_events_business_id_idx ON booking_status_events (business_id);
CREATE INDEX IF NOT EXISTS booking_status_events_booking_id_idx ON booking_status_events (booking_id);
CREATE INDEX IF NOT EXISTS booking_status_events_created_at_idx ON booking_status_events (created_at);
CREATE INDEX IF NOT EXISTS booking_status_events_booking_status_idx ON booking_status_events (booking_id, created_at);

-- Booking holds indexes
CREATE INDEX IF NOT EXISTS booking_holds_business_id_idx ON booking_holds (business_id);
CREATE UNIQUE INDEX IF NOT EXISTS booking_holds_idempotency_key_idx ON booking_holds (idempotency_key);
CREATE INDEX IF NOT EXISTS booking_holds_expires_at_idx ON booking_holds (expires_at);
CREATE INDEX IF NOT EXISTS booking_holds_occupied_range_idx ON booking_holds USING GIST (occupied_range);
CREATE INDEX IF NOT EXISTS booking_holds_status_idx ON booking_holds (status);

-- Booking management tokens indexes
CREATE INDEX IF NOT EXISTS booking_management_tokens_business_id_idx ON booking_management_tokens (business_id);
CREATE INDEX IF NOT EXISTS booking_management_tokens_booking_id_idx ON booking_management_tokens (booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS booking_management_tokens_token_hash_idx ON booking_management_tokens (token_hash);
CREATE INDEX IF NOT EXISTS booking_management_tokens_expires_at_idx ON booking_management_tokens (expires_at);

-- Subscriptions indexes
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_business_id_idx ON subscriptions (business_id);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx ON subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx ON subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_plan_key_idx ON subscriptions (plan_key);
CREATE INDEX IF NOT EXISTS subscriptions_billing_status_idx ON subscriptions (billing_status);

-- Entitlements indexes
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_business_id_feature_key_idx ON entitlements (business_id, feature_key, source);
CREATE INDEX IF NOT EXISTS entitlements_business_id_idx ON entitlements (business_id);
CREATE INDEX IF NOT EXISTS entitlements_feature_key_idx ON entitlements (feature_key);
CREATE INDEX IF NOT EXISTS entitlements_valid_from_idx ON entitlements (valid_from);
CREATE INDEX IF NOT EXISTS entitlements_valid_until_idx ON entitlements (valid_until);

-- Payments indexes
CREATE INDEX IF NOT EXISTS payments_business_id_idx ON payments (business_id);
CREATE INDEX IF NOT EXISTS payments_booking_id_idx ON payments (booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_intent_id_idx ON payments (provider_payment_intent_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments (created_at);

-- Outbox events indexes
CREATE INDEX IF NOT EXISTS outbox_events_business_id_idx ON outbox_events (business_id);
CREATE INDEX IF NOT EXISTS outbox_events_status_idx ON outbox_events (status);
CREATE INDEX IF NOT EXISTS outbox_events_next_attempt_at_idx ON outbox_events (next_attempt_at);
CREATE INDEX IF NOT EXISTS outbox_events_created_at_idx ON outbox_events (created_at);
CREATE INDEX IF NOT EXISTS outbox_events_process_idx ON outbox_events (status, next_attempt_at);

-- Webhook events indexes
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_id_idx ON webhook_events (provider, provider_event_id);
CREATE INDEX IF NOT EXISTS webhook_events_provider_idx ON webhook_events (provider);
CREATE INDEX IF NOT EXISTS webhook_events_event_type_idx ON webhook_events (event_type);
CREATE INDEX IF NOT EXISTS webhook_events_processing_status_idx ON webhook_events (processing_status);
CREATE INDEX IF NOT EXISTS webhook_events_created_at_idx ON webhook_events (created_at);

-- Idempotency records indexes
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_records_actor_idempotency_key_idx ON idempotency_records (actor_type, actor_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idempotency_records_idempotency_key_idx ON idempotency_records (idempotency_key);
CREATE INDEX IF NOT EXISTS idempotency_records_expires_at_idx ON idempotency_records (expires_at);
CREATE INDEX IF NOT EXISTS idempotency_records_created_at_idx ON idempotency_records (created_at);

-- Audit events indexes
CREATE INDEX IF NOT EXISTS audit_events_business_id_idx ON audit_events (business_id);
CREATE INDEX IF NOT EXISTS audit_events_actor_type_actor_id_idx ON audit_events (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS audit_events_target_type_target_id_idx ON audit_events (target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events (action);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events (created_at);
CREATE INDEX IF NOT EXISTS audit_events_correlation_id_idx ON audit_events (correlation_id);

-- Platform admins indexes
CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_external_auth_user_id_idx ON platform_admins (external_auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_email_idx ON platform_admins (email);
CREATE INDEX IF NOT EXISTS platform_admins_role_idx ON platform_admins (role);
CREATE INDEX IF NOT EXISTS platform_admins_status_idx ON platform_admins (status);

-- Booking policies indexes
CREATE UNIQUE INDEX IF NOT EXISTS booking_policies_business_id_version_idx ON booking_policies (business_id, version);
CREATE INDEX IF NOT EXISTS booking_policies_business_id_idx ON booking_policies (business_id);
CREATE INDEX IF NOT EXISTS booking_policies_is_active_idx ON booking_policies (is_active);
CREATE INDEX IF NOT EXISTS booking_policies_effective_from_idx ON booking_policies (effective_from);

-- Business support notes indexes
CREATE INDEX IF NOT EXISTS business_support_notes_business_id_idx ON business_support_notes (business_id);
CREATE INDEX IF NOT EXISTS business_support_notes_platform_admin_id_idx ON business_support_notes (platform_admin_id);
CREATE INDEX IF NOT EXISTS business_support_notes_created_at_idx ON business_support_notes (created_at);

-- Notification deliveries indexes
CREATE INDEX IF NOT EXISTS notification_deliveries_business_id_idx ON notification_deliveries (business_id);
CREATE INDEX IF NOT EXISTS notification_deliveries_booking_id_idx ON notification_deliveries (booking_id);
CREATE INDEX IF NOT EXISTS notification_deliveries_outbox_event_id_idx ON notification_deliveries (outbox_event_id);
CREATE INDEX IF NOT EXISTS notification_deliveries_channel_idx ON notification_deliveries (channel);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx ON notification_deliveries (status);
CREATE INDEX IF NOT EXISTS notification_deliveries_recipient_hash_idx ON notification_deliveries (recipient_hash);
CREATE INDEX IF NOT EXISTS notification_deliveries_created_at_idx ON notification_deliveries (created_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_process_idx ON notification_deliveries (status, attempt_count, created_at);

-- ============================================
-- TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all tables that have updated_at column
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_business_users_updated_at BEFORE UPDATE ON business_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_staff_profiles_updated_at BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_categories_updated_at BEFORE UPDATE ON service_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_staff_services_updated_at BEFORE UPDATE ON staff_services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_resource_requirements_updated_at BEFORE UPDATE ON service_resource_requirements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_availability_rules_updated_at BEFORE UPDATE ON availability_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_availability_exceptions_updated_at BEFORE UPDATE ON availability_exceptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booking_resources_updated_at BEFORE UPDATE ON booking_resources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booking_status_events_updated_at BEFORE UPDATE ON booking_status_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booking_holds_updated_at BEFORE UPDATE ON booking_holds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booking_management_tokens_updated_at BEFORE UPDATE ON booking_management_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_entitlements_updated_at BEFORE UPDATE ON entitlements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_outbox_events_updated_at BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhook_events_updated_at BEFORE UPDATE ON webhook_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_idempotency_records_updated_at BEFORE UPDATE ON idempotency_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_audit_events_updated_at BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_admins_updated_at BEFORE UPDATE ON platform_admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booking_policies_updated_at BEFORE UPDATE ON booking_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_business_support_notes_updated_at BEFORE UPDATE ON business_support_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_deliveries_updated_at BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL DATA
-- ============================================

-- Create a default platform admin (for development)
-- In production, this would be created through a secure provisioning process
INSERT INTO platform_admins (id, external_auth_user_id, email, role, status, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'platform_admin_1',
  'admin@booking-platform.example.com',
  'platform_owner',
  'active',
  NOW(),
  NOW()
) ON CONFLICT (external_auth_user_id) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE businesses IS 'Tenant root table containing business information';
COMMENT ON TABLE business_users IS 'Authenticated users linked to businesses';
COMMENT ON TABLE locations IS 'Physical or virtual locations for businesses';
COMMENT ON TABLE staff_profiles IS 'Schedulable staff profiles managed by businesses';
COMMENT ON TABLE service_categories IS 'Categories for organizing services';
COMMENT ON TABLE services IS 'Bookable services offered by businesses';
COMMENT ON TABLE staff_services IS 'Many-to-many relationship between staff and services';
COMMENT ON TABLE resources IS 'Bookable resources like rooms, chairs, equipment';
COMMENT ON TABLE service_resource_requirements IS 'Resource requirements for services';
COMMENT ON TABLE availability_rules IS 'Recurring availability rules for staff/resources';
COMMENT ON TABLE availability_exceptions IS 'One-off availability exceptions (closures, breaks, etc.)';
COMMENT ON TABLE customers IS 'Customer records for businesses';
COMMENT ON TABLE bookings IS 'Booking records with snapshots for historical accuracy';
COMMENT ON TABLE booking_resources IS 'Resource allocations for bookings';
COMMENT ON TABLE booking_status_events IS 'Audit trail for booking status changes';
COMMENT ON TABLE booking_holds IS 'Temporary reservations for payment processing';
COMMENT ON TABLE booking_management_tokens IS 'Secure tokens for customer booking management';
COMMENT ON TABLE subscriptions IS 'Subscription records for businesses';
COMMENT ON TABLE entitlements IS 'Feature limits and overrides for businesses';
COMMENT ON TABLE payments IS 'Payment records for bookings (Phase C)';
COMMENT ON TABLE outbox_events IS 'Outbox pattern for async processing';
COMMENT ON TABLE webhook_events IS 'Webhook processing tracking';
COMMENT ON TABLE idempotency_records IS 'Idempotency tracking for requests';
COMMENT ON TABLE audit_events IS 'Platform audit trail';
COMMENT ON TABLE platform_admins IS 'Platform administrator records';
COMMENT ON TABLE booking_policies IS 'Booking policies for businesses';
COMMENT ON TABLE business_support_notes IS 'Internal support notes for businesses';
COMMENT ON TABLE notification_deliveries IS 'Notification delivery tracking';

-- ============================================
-- MIGRATION TRACKING
-- ============================================

-- Record this migration
INSERT INTO drizzle_migrations (hash, created_at)
VALUES ('0001_initial_schema', NOW())
ON CONFLICT (hash) DO NOTHING;
