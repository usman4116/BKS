-- Migration: 0002_rls_policies
-- Description: Row-Level Security policies for tenant isolation
-- Created: 2026-07-29
-- Author: Codex

-- ============================================
-- ENABLE RLS ON ALL TENANT-OWNED TABLES
-- ============================================

-- Enable RLS on all tenant-owned tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_resource_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_management_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_support_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- ============================================
-- DROP EXISTING POLICIES (if any)
-- ============================================

-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS platform_admin_can_see_all ON businesses;
DROP POLICY IF EXISTS business_user_can_see_own ON businesses;
DROP POLICY IF EXISTS public_can_see_published ON businesses;

DROP POLICY IF EXISTS platform_admin_can_see_all ON business_users;
DROP POLICY IF EXISTS business_user_can_see_own_business ON business_users;

DROP POLICY IF EXISTS platform_admin_can_see_all ON locations;
DROP POLICY IF EXISTS business_user_can_see_own ON locations;

DROP POLICY IF EXISTS platform_admin_can_see_all ON staff_profiles;
DROP POLICY IF EXISTS business_user_can_see_own ON staff_profiles;
DROP POLICY IF EXISTS public_can_see_public_staff ON staff_profiles;

DROP POLICY IF EXISTS platform_admin_can_see_all ON service_categories;
DROP POLICY IF EXISTS business_user_can_see_own ON service_categories;

DROP POLICY IF EXISTS platform_admin_can_see_all ON services;
DROP POLICY IF EXISTS business_user_can_see_own ON services;
DROP POLICY IF EXISTS public_can_see_public_services ON services;

DROP POLICY IF EXISTS platform_admin_can_see_all ON staff_services;
DROP POLICY IF EXISTS business_user_can_see_own ON staff_services;

DROP POLICY IF EXISTS platform_admin_can_see_all ON resources;
DROP POLICY IF EXISTS business_user_can_see_own ON resources;

DROP POLICY IF EXISTS platform_admin_can_see_all ON service_resource_requirements;
DROP POLICY IF EXISTS business_user_can_see_own ON service_resource_requirements;

DROP POLICY IF EXISTS platform_admin_can_see_all ON availability_rules;
DROP POLICY IF EXISTS business_user_can_see_own ON availability_rules;

DROP POLICY IF EXISTS platform_admin_can_see_all ON availability_exceptions;
DROP POLICY IF EXISTS business_user_can_see_own ON availability_exceptions;

DROP POLICY IF EXISTS platform_admin_can_see_all ON customers;
DROP POLICY IF EXISTS business_user_can_see_own ON customers;

DROP POLICY IF EXISTS platform_admin_can_see_all ON bookings;
DROP POLICY IF EXISTS business_user_can_see_own ON bookings;

DROP POLICY IF EXISTS platform_admin_can_see_all ON booking_resources;
DROP POLICY IF EXISTS business_user_can_see_own ON booking_resources;

DROP POLICY IF EXISTS platform_admin_can_see_all ON booking_status_events;
DROP POLICY IF EXISTS business_user_can_see_own ON booking_status_events;

DROP POLICY IF EXISTS platform_admin_can_see_all ON booking_holds;
DROP POLICY IF EXISTS business_user_can_see_own ON booking_holds;

DROP POLICY IF EXISTS platform_admin_can_see_all ON booking_management_tokens;
DROP POLICY IF EXISTS business_user_can_see_own ON booking_management_tokens;

DROP POLICY IF EXISTS platform_admin_can_see_all ON subscriptions;
DROP POLICY IF EXISTS business_user_can_see_own ON subscriptions;

DROP POLICY IF EXISTS platform_admin_can_see_all ON entitlements;
DROP POLICY IF EXISTS business_user_can_see_own ON entitlements;

DROP POLICY IF EXISTS platform_admin_can_see_all ON payments;
DROP POLICY IF EXISTS business_user_can_see_own ON payments;

DROP POLICY IF EXISTS platform_admin_can_see_all ON outbox_events;
DROP POLICY IF EXISTS business_user_can_see_own ON outbox_events;

DROP POLICY IF EXISTS platform_admin_can_see_all ON webhook_events;

DROP POLICY IF EXISTS platform_admin_can_see_all ON idempotency_records;
DROP POLICY IF EXISTS business_user_can_see_own ON idempotency_records;

DROP POLICY IF EXISTS platform_admin_can_see_all ON audit_events;
DROP POLICY IF EXISTS business_user_can_see_own ON audit_events;

DROP POLICY IF EXISTS platform_admin_can_see_all ON platform_admins;

DROP POLICY IF EXISTS platform_admin_can_see_all ON booking_policies;
DROP POLICY IF EXISTS business_user_can_see_own ON booking_policies;

DROP POLICY IF EXISTS platform_admin_can_see_all ON business_support_notes;

DROP POLICY IF EXISTS platform_admin_can_see_all ON notification_deliveries;
DROP POLICY IF EXISTS business_user_can_see_own ON notification_deliveries;

-- ============================================
-- BUSINESSES TABLE POLICIES
-- ============================================

-- Platform admins can see all businesses
CREATE POLICY platform_admin_can_see_all ON businesses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see their own business
CREATE POLICY business_user_can_see_own ON businesses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM business_users 
      WHERE business_id = businesses.id 
      AND external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Public can see published businesses
CREATE POLICY public_can_see_published ON businesses
  FOR SELECT
  USING (
    booking_page_published = true 
    AND status = 'active'
  );

-- ============================================
-- BUSINESS_USERS TABLE POLICIES
-- ============================================

-- Platform admins can see all business users
CREATE POLICY platform_admin_can_see_all ON business_users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see users in their own business
CREATE POLICY business_user_can_see_own_business ON business_users
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- LOCATIONS TABLE POLICIES
-- ============================================

-- Platform admins can see all locations
CREATE POLICY platform_admin_can_see_all ON locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see locations in their own business
CREATE POLICY business_user_can_see_own ON locations
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- STAFF_PROFILES TABLE POLICIES
-- ============================================

-- Platform admins can see all staff profiles
CREATE POLICY platform_admin_can_see_all ON staff_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see staff in their own business
CREATE POLICY business_user_can_see_own ON staff_profiles
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Public can see active, public staff profiles for published businesses
CREATE POLICY public_can_see_public_staff ON staff_profiles
  FOR SELECT
  USING (
    is_public = true 
    AND is_active = true 
    AND business_id IN (
      SELECT id FROM businesses 
      WHERE booking_page_published = true 
      AND status = 'active'
    )
  );

-- ============================================
-- SERVICE_CATEGORIES TABLE POLICIES
-- ============================================

-- Platform admins can see all service categories
CREATE POLICY platform_admin_can_see_all ON service_categories
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see categories in their own business
CREATE POLICY business_user_can_see_own ON service_categories
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- SERVICES TABLE POLICIES
-- ============================================

-- Platform admins can see all services
CREATE POLICY platform_admin_can_see_all ON services
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see services in their own business
CREATE POLICY business_user_can_see_own ON services
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Public can see active, public services for published businesses
CREATE POLICY public_can_see_public_services ON services
  FOR SELECT
  USING (
    is_public = true 
    AND is_active = true 
    AND business_id IN (
      SELECT id FROM businesses 
      WHERE booking_page_published = true 
      AND status = 'active'
    )
  );

-- ============================================
-- STAFF_SERVICES TABLE POLICIES
-- ============================================

-- Platform admins can see all staff-service assignments
CREATE POLICY platform_admin_can_see_all ON staff_services
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see assignments in their own business
CREATE POLICY business_user_can_see_own ON staff_services
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- RESOURCES TABLE POLICIES
-- ============================================

-- Platform admins can see all resources
CREATE POLICY platform_admin_can_see_all ON resources
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see resources in their own business
CREATE POLICY business_user_can_see_own ON resources
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- SERVICE_RESOURCE_REQUIREMENTS TABLE POLICIES
-- ============================================

-- Platform admins can see all service resource requirements
CREATE POLICY platform_admin_can_see_all ON service_resource_requirements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see requirements in their own business
CREATE POLICY business_user_can_see_own ON service_resource_requirements
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- AVAILABILITY_RULES TABLE POLICIES
-- ============================================

-- Platform admins can see all availability rules
CREATE POLICY platform_admin_can_see_all ON availability_rules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see rules in their own business
CREATE POLICY business_user_can_see_own ON availability_rules
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- AVAILABILITY_EXCEPTIONS TABLE POLICIES
-- ============================================

-- Platform admins can see all availability exceptions
CREATE POLICY platform_admin_can_see_all ON availability_exceptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see exceptions in their own business
CREATE POLICY business_user_can_see_own ON availability_exceptions
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- CUSTOMERS TABLE POLICIES
-- ============================================

-- Platform admins can see all customers
CREATE POLICY platform_admin_can_see_all ON customers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see customers in their own business
CREATE POLICY business_user_can_see_own ON customers
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- BOOKINGS TABLE POLICIES
-- ============================================

-- Platform admins can see all bookings
CREATE POLICY platform_admin_can_see_all ON bookings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see bookings in their own business
CREATE POLICY business_user_can_see_own ON bookings
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- BOOKING_RESOURCES TABLE POLICIES
-- ============================================

-- Platform admins can see all booking resources
CREATE POLICY platform_admin_can_see_all ON booking_resources
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see booking resources in their own business
CREATE POLICY business_user_can_see_own ON booking_resources
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- BOOKING_STATUS_EVENTS TABLE POLICIES
-- ============================================

-- Platform admins can see all booking status events
CREATE POLICY platform_admin_can_see_all ON booking_status_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see booking status events in their own business
CREATE POLICY business_user_can_see_own ON booking_status_events
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- BOOKING_HOLDS TABLE POLICIES
-- ============================================

-- Platform admins can see all booking holds
CREATE POLICY platform_admin_can_see_all ON booking_holds
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see booking holds in their own business
CREATE POLICY business_user_can_see_own ON booking_holds
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- BOOKING_MANAGEMENT_TOKENS TABLE POLICIES
-- ============================================

-- Platform admins can see all management tokens
CREATE POLICY platform_admin_can_see_all ON booking_management_tokens
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see management tokens for their own business
CREATE POLICY business_user_can_see_own ON booking_management_tokens
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- SUBSCRIPTIONS TABLE POLICIES
-- ============================================

-- Platform admins can see all subscriptions
CREATE POLICY platform_admin_can_see_all ON subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see subscriptions for their own business
CREATE POLICY business_user_can_see_own ON subscriptions
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- ENTITLEMENTS TABLE POLICIES
-- ============================================

-- Platform admins can see all entitlements
CREATE POLICY platform_admin_can_see_all ON entitlements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see entitlements for their own business
CREATE POLICY business_user_can_see_own ON entitlements
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- PAYMENTS TABLE POLICIES
-- ============================================

-- Platform admins can see all payments
CREATE POLICY platform_admin_can_see_all ON payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see payments for their own business
CREATE POLICY business_user_can_see_own ON payments
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- OUTBOX_EVENTS TABLE POLICIES
-- ============================================

-- Platform admins can see all outbox events
CREATE POLICY platform_admin_can_see_all ON outbox_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can see outbox events for their own business or platform events
CREATE POLICY business_user_can_see_own ON outbox_events
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    ) OR business_id IS NULL
  );

-- ============================================
-- WEBHOOK_EVENTS TABLE POLICIES
-- ============================================

-- Platform admins can see all webhook events
CREATE POLICY platform_admin_can_see_all ON webhook_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- IDEMPOTENCY_RECORDS TABLE POLICIES
-- ============================================

-- Platform admins can see all idempotency records
CREATE POLICY platform_admin_can_see_all ON idempotency_records
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see their own idempotency records
CREATE POLICY business_user_can_see_own ON idempotency_records
  FOR ALL
  USING (
    actor_id = current_setting('app.current_user_id')
  );

-- ============================================
-- AUDIT_EVENTS TABLE POLICIES
-- ============================================

-- Platform admins can see all audit events
CREATE POLICY platform_admin_can_see_all ON audit_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see audit events for their own business
CREATE POLICY business_user_can_see_own ON audit_events
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- PLATFORM_ADMINS TABLE POLICIES
-- ============================================

-- Only platform admins can see other platform admins
CREATE POLICY platform_admin_can_see_all ON platform_admins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- BOOKING_POLICIES TABLE POLICIES
-- ============================================

-- Platform admins can see all booking policies
CREATE POLICY platform_admin_can_see_all ON booking_policies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can only see booking policies for their own business
CREATE POLICY business_user_can_see_own ON booking_policies
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- BUSINESS_SUPPORT_NOTES TABLE POLICIES
-- ============================================

-- Only platform admins can see support notes
CREATE POLICY platform_admin_can_see_all ON business_support_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- ============================================
-- NOTIFICATION_DELIVERIES TABLE POLICIES
-- ============================================

-- Platform admins can see all notification deliveries
CREATE POLICY platform_admin_can_see_all ON notification_deliveries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    )
  );

-- Business users can see notification deliveries for their own business or platform events
CREATE POLICY business_user_can_see_own ON notification_deliveries
  FOR ALL
  USING (
    business_id = (
      SELECT business_id FROM business_users 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
      AND status = 'active'
    ) OR business_id IS NULL
  );

-- ============================================
-- MIGRATION TRACKING
-- ============================================

-- Record this migration
INSERT INTO drizzle_migrations (hash, created_at)
VALUES ('0002_rls_policies', NOW())
ON CONFLICT (hash) DO NOTHING;
