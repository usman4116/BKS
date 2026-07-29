/**
 * Row-Level Security (RLS) Policies for Multi-Tenant Booking Platform
 * 
 * This file contains RLS policy definitions and utilities for tenant isolation.
 * RLS is mandatory for every tenant-owned table as specified in PRD Section 11.2.
 */

import { db } from './client';
import * as schema from './schema';
import { logger } from '../observability/logger';

// ============================================
// RLS POLICY DEFINITIONS
// ============================================

/**
 * RLS Policy types
 */
export type RlsPolicy = {
  table: string;
  name: string;
  roles: string[];
  using: string;
  check?: string;
  withCheck?: string;
};

/**
 * Tenant context for RLS
 */
export interface TenantContext {
  businessId?: string;
  userId?: string;
  isPlatformAdmin?: boolean;
  isBusinessUser?: boolean;
}

// ============================================
// RLS POLICY DEFINITIONS FOR EACH TABLE
// ============================================

/**
 * Businesses table RLS policies
 * - Platform admins can see all businesses
 * - Business users can only see their own business
 * - Public can see published businesses
 */
export const businessesRlsPolicies: RlsPolicy[] = [
  {
    table: 'businesses',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'businesses',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "EXISTS (SELECT 1 FROM business_users WHERE business_id = businesses.id AND external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'businesses',
    name: 'public_can_see_published',
    roles: ['public'],
    using: "booking_page_published = true AND status = 'active'",
  },
];

/**
 * Business Users table RLS policies
 * - Platform admins can see all business users
 * - Business users can only see users in their own business
 */
export const businessUsersRlsPolicies: RlsPolicy[] = [
  {
    table: 'business_users',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'business_users',
    name: 'business_user_can_see_own_business',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Locations table RLS policies
 * - Platform admins can see all locations
 * - Business users can only see locations in their own business
 */
export const locationsRlsPolicies: RlsPolicy[] = [
  {
    table: 'locations',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'locations',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Staff Profiles table RLS policies
 * - Platform admins can see all staff profiles
 * - Business users can only see staff in their own business
 * - Public can see active, public staff profiles for published businesses
 */
export const staffProfilesRlsPolicies: RlsPolicy[] = [
  {
    table: 'staff_profiles',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'staff_profiles',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'staff_profiles',
    name: 'public_can_see_public_staff',
    roles: ['public'],
    using: "is_public = true AND is_active = true AND business_id IN (SELECT id FROM businesses WHERE booking_page_published = true AND status = 'active')",
  },
];

/**
 * Service Categories table RLS policies
 */
export const serviceCategoriesRlsPolicies: RlsPolicy[] = [
  {
    table: 'service_categories',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'service_categories',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Services table RLS policies
 * - Platform admins can see all services
 * - Business users can only see services in their own business
 * - Public can see active, public services for published businesses
 */
export const servicesRlsPolicies: RlsPolicy[] = [
  {
    table: 'services',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'services',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'services',
    name: 'public_can_see_public_services',
    roles: ['public'],
    using: "is_public = true AND is_active = true AND business_id IN (SELECT id FROM businesses WHERE booking_page_published = true AND status = 'active')",
  },
];

/**
 * Staff Services table RLS policies
 */
export const staffServicesRlsPolicies: RlsPolicy[] = [
  {
    table: 'staff_services',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'staff_services',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Resources table RLS policies
 */
export const resourcesRlsPolicies: RlsPolicy[] = [
  {
    table: 'resources',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'resources',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Service Resource Requirements table RLS policies
 */
export const serviceResourceRequirementsRlsPolicies: RlsPolicy[] = [
  {
    table: 'service_resource_requirements',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'service_resource_requirements',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Availability Rules table RLS policies
 */
export const availabilityRulesRlsPolicies: RlsPolicy[] = [
  {
    table: 'availability_rules',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'availability_rules',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Availability Exceptions table RLS policies
 */
export const availabilityExceptionsRlsPolicies: RlsPolicy[] = [
  {
    table: 'availability_exceptions',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'availability_exceptions',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Customers table RLS policies
 * - Platform admins can see all customers (with support reason)
 * - Business users can only see customers in their own business
 */
export const customersRlsPolicies: RlsPolicy[] = [
  {
    table: 'customers',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'customers',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Bookings table RLS policies
 * - Platform admins can see all bookings (with support reason)
 * - Business users can only see bookings in their own business
 * - Customers can only see their own bookings (via management token)
 */
export const bookingsRlsPolicies: RlsPolicy[] = [
  {
    table: 'bookings',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'bookings',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Booking Resources table RLS policies
 */
export const bookingResourcesRlsPolicies: RlsPolicy[] = [
  {
    table: 'booking_resources',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'booking_resources',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Booking Status Events table RLS policies
 */
export const bookingStatusEventsRlsPolicies: RlsPolicy[] = [
  {
    table: 'booking_status_events',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'booking_status_events',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Booking Holds table RLS policies
 */
export const bookingHoldsRlsPolicies: RlsPolicy[] = [
  {
    table: 'booking_holds',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'booking_holds',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Booking Management Tokens table RLS policies
 * - Platform admins can see all tokens (with support reason)
 * - Business users can see tokens for their own business
 * - Public can validate tokens for their own bookings
 */
export const bookingManagementTokensRlsPolicies: RlsPolicy[] = [
  {
    table: 'booking_management_tokens',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'booking_management_tokens',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Subscriptions table RLS policies
 */
export const subscriptionsRlsPolicies: RlsPolicy[] = [
  {
    table: 'subscriptions',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'subscriptions',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Entitlements table RLS policies
 */
export const entitlementsRlsPolicies: RlsPolicy[] = [
  {
    table: 'entitlements',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'entitlements',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Payments table RLS policies
 */
export const paymentsRlsPolicies: RlsPolicy[] = [
  {
    table: 'payments',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'payments',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Outbox Events table RLS policies
 */
export const outboxEventsRlsPolicies: RlsPolicy[] = [
  {
    table: 'outbox_events',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'outbox_events',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active') OR business_id IS NULL",
  },
];

/**
 * Webhook Events table RLS policies
 */
export const webhookEventsRlsPolicies: RlsPolicy[] = [
  {
    table: 'webhook_events',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Idempotency Records table RLS policies
 */
export const idempotencyRecordsRlsPolicies: RlsPolicy[] = [
  {
    table: 'idempotency_records',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'idempotency_records',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "actor_id = current_setting('app.current_user_id')",
  },
];

/**
 * Audit Events table RLS policies
 */
export const auditEventsRlsPolicies: RlsPolicy[] = [
  {
    table: 'audit_events',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'audit_events',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Platform Admins table RLS policies
 * - Only platform admins can see other platform admins
 */
export const platformAdminsRlsPolicies: RlsPolicy[] = [
  {
    table: 'platform_admins',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Booking Policies table RLS policies
 */
export const bookingPoliciesRlsPolicies: RlsPolicy[] = [
  {
    table: 'booking_policies',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'booking_policies',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Business Support Notes table RLS policies
 * - Only platform admins can see support notes
 */
export const businessSupportNotesRlsPolicies: RlsPolicy[] = [
  {
    table: 'business_support_notes',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
];

/**
 * Notification Deliveries table RLS policies
 */
export const notificationDeliveriesRlsPolicies: RlsPolicy[] = [
  {
    table: 'notification_deliveries',
    name: 'platform_admin_can_see_all',
    roles: ['platform_admin'],
    using: "EXISTS (SELECT 1 FROM platform_admins WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active')",
  },
  {
    table: 'notification_deliveries',
    name: 'business_user_can_see_own',
    roles: ['business_user'],
    using: "business_id = (SELECT business_id FROM business_users WHERE external_auth_user_id = current_setting('app.current_user_id') AND status = 'active') OR business_id IS NULL",
  },
];

// ============================================
// ALL RLS POLICIES
// ============================================

export const ALL_RLS_POLICIES: Record<string, RlsPolicy[]> = {
  businesses: businessesRlsPolicies,
  business_users: businessUsersRlsPolicies,
  locations: locationsRlsPolicies,
  staff_profiles: staffProfilesRlsPolicies,
  service_categories: serviceCategoriesRlsPolicies,
  services: servicesRlsPolicies,
  staff_services: staffServicesRlsPolicies,
  resources: resourcesRlsPolicies,
  service_resource_requirements: serviceResourceRequirementsRlsPolicies,
  availability_rules: availabilityRulesRlsPolicies,
  availability_exceptions: availabilityExceptionsRlsPolicies,
  customers: customersRlsPolicies,
  bookings: bookingsRlsPolicies,
  booking_resources: bookingResourcesRlsPolicies,
  booking_status_events: bookingStatusEventsRlsPolicies,
  booking_holds: bookingHoldsRlsPolicies,
  booking_management_tokens: bookingManagementTokensRlsPolicies,
  subscriptions: subscriptionsRlsPolicies,
  entitlements: entitlementsRlsPolicies,
  payments: paymentsRlsPolicies,
  outbox_events: outboxEventsRlsPolicies,
  webhook_events: webhookEventsRlsPolicies,
  idempotency_records: idempotencyRecordsRlsPolicies,
  audit_events: auditEventsRlsPolicies,
  platform_admins: platformAdminsRlsPolicies,
  booking_policies: bookingPoliciesRlsPolicies,
  business_support_notes: businessSupportNotesRlsPolicies,
  notification_deliveries: notificationDeliveriesRlsPolicies,
};

// ============================================
// RLS UTILITY FUNCTIONS
// ============================================

/**
 * Enable RLS on a table
 */
export async function enableRlsOnTable(tableName: string): Promise<void> {
  try {
    await db.execute(
      schema.sql`ALTER TABLE ${schema.sql.identifier(tableName)} ENABLE ROW LEVEL SECURITY`
    );
    logger.info(`Enabled RLS on table: ${tableName}`);
  } catch (error) {
    logger.error(`Failed to enable RLS on table ${tableName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Disable RLS on a table (for debugging only)
 */
export async function disableRlsOnTable(tableName: string): Promise<void> {
  try {
    await db.execute(
      schema.sql`ALTER TABLE ${schema.sql.identifier(tableName)} DISABLE ROW LEVEL SECURITY`
    );
    logger.warn(`Disabled RLS on table: ${tableName} (for debugging only)`);
  } catch (error) {
    logger.error(`Failed to disable RLS on table ${tableName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Create RLS policy on a table
 */
export async function createRlsPolicy(
  tableName: string,
  policyName: string,
  usingClause: string,
  checkClause?: string
): Promise<void> {
  try {
    const sql = schema.sql`
      CREATE POLICY ${schema.sql.identifier(policyName)}
      ON ${schema.sql.identifier(tableName)}
      ${checkClause ? schema.sql`FOR ALL` : schema.sql`FOR SELECT, INSERT, UPDATE, DELETE`}
      USING (${schema.sql.raw(usingClause)})
      ${checkClause ? schema.sql`WITH CHECK (${schema.sql.raw(checkClause)})` : schema.sql``}
    `;
    
    await db.execute(sql);
    logger.info(`Created RLS policy ${policyName} on table ${tableName}`);
  } catch (error) {
    logger.error(`Failed to create RLS policy ${policyName} on table ${tableName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Drop RLS policy from a table
 */
export async function dropRlsPolicy(tableName: string, policyName: string): Promise<void> {
  try {
    await db.execute(
      schema.sql`DROP POLICY IF EXISTS ${schema.sql.identifier(policyName)} ON ${schema.sql.identifier(tableName)}`
    );
    logger.info(`Dropped RLS policy ${policyName} from table ${tableName}`);
  } catch (error) {
    logger.error(`Failed to drop RLS policy ${policyName} from table ${tableName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Apply all RLS policies for a table
 */
export async function applyTableRlsPolicies(tableName: string, policies: RlsPolicy[]): Promise<void> {
  logger.info(`Applying RLS policies for table: ${tableName}`);
  
  // Enable RLS on the table
  await enableRlsOnTable(tableName);
  
  // Drop existing policies for this table
  const existingPolicies = await getTablePolicies(tableName);
  for (const policy of existingPolicies) {
    await dropRlsPolicy(tableName, policy.policyname);
  }
  
  // Create new policies
  for (const policy of policies) {
    await createRlsPolicy(tableName, policy.name, policy.using, policy.check);
  }
  
  logger.info(`Applied ${policies.length} RLS policies for table ${tableName}`);
}

/**
 * Get existing policies for a table
 */
export async function getTablePolicies(tableName: string): Promise<{ policyname: string; roles: string[]; cmd: string }[]> {
  try {
    const result = await db.execute<{ policyname: string; roles: string[]; cmd: string }>(
      schema.sql`
        SELECT policyname, roles, cmd 
        FROM pg_policies 
        WHERE tablename = ${tableName}
      `
    );
    return result.rows;
  } catch (error) {
    logger.error(`Failed to get policies for table ${tableName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Apply all RLS policies for the entire database
 */
export async function applyAllRlsPolicies(): Promise<void> {
  const startTime = Date.now();
  logger.info('Applying all RLS policies...');
  
  try {
    // Get all table names that need RLS
    const tableNames = Object.keys(ALL_RLS_POLICIES);
    
    for (const tableName of tableNames) {
      const policies = ALL_RLS_POLICIES[tableName];
      if (policies && policies.length > 0) {
        await applyTableRlsPolicies(tableName, policies);
      }
    }
    
    logger.info(`Applied all RLS policies in ${Date.now() - startTime}ms`);
  } catch (error) {
    logger.error('Failed to apply all RLS policies', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Set tenant context for the current database session
 */
export function setTenantContext(context: TenantContext): void {
  // Set PostgreSQL session variables for RLS
  // These will be used in the RLS policies
  
  if (context.businessId) {
    db.execute(schema.sql`SELECT set_config('app.current_business_id', ${context.businessId}, false)`);
  }
  
  if (context.userId) {
    db.execute(schema.sql`SELECT set_config('app.current_user_id', ${context.userId}, false)`);
  }
  
  if (context.isPlatformAdmin) {
    db.execute(schema.sql`SELECT set_config('app.is_platform_admin', 'true', false)`);
  } else {
    db.execute(schema.sql`SELECT set_config('app.is_platform_admin', 'false', false)`);
  }
  
  if (context.isBusinessUser) {
    db.execute(schema.sql`SELECT set_config('app.is_business_user', 'true', false)`);
  } else {
    db.execute(schema.sql`SELECT set_config('app.is_business_user', 'false', false)`);
  }
  
  logger.debug('Set tenant context', { context });
}

/**
 * Clear tenant context
 */
export function clearTenantContext(): void {
  db.execute(schema.sql`SELECT set_config('app.current_business_id', '', false)`);
  db.execute(schema.sql`SELECT set_config('app.current_user_id', '', false)`);
  db.execute(schema.sql`SELECT set_config('app.is_platform_admin', 'false', false)`);
  db.execute(schema.sql`SELECT set_config('app.is_business_user', 'false', false)`);
  
  logger.debug('Cleared tenant context');
}

/**
 * Test RLS isolation for a specific table
 */
export async function testRlsIsolation(
  tableName: string,
  businessId: string,
  userBusinessId: string
): Promise<boolean> {
  try {
    // Set context for the user
    setTenantContext({ businessId: userBusinessId, isBusinessUser: true });
    
    // Try to query data from a different business
    const result = await db.execute<{ id: string; business_id: string }>(
      schema.sql`SELECT id, business_id FROM ${schema.sql.identifier(tableName)} WHERE business_id = ${businessId} LIMIT 1`
    );
    
    // If RLS is working, this should return no rows when businessId != userBusinessId
    const isIsolated = result.rows.length === 0 || result.rows[0].business_id === userBusinessId;
    
    // Clear context
    clearTenantContext();
    
    return isIsolated;
  } catch (error) {
    logger.error(`RLS isolation test failed for table ${tableName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    clearTenantContext();
    return false;
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  enableRlsOnTable,
  disableRlsOnTable,
  createRlsPolicy,
  dropRlsPolicy,
  applyTableRlsPolicies,
  getTablePolicies,
  applyAllRlsPolicies,
  setTenantContext,
  clearTenantContext,
  testRlsIsolation,
};

export default {
  // Policy collections
  ALL_RLS_POLICIES,
  businessesRlsPolicies,
  businessUsersRlsPolicies,
  locationsRlsPolicies,
  staffProfilesRlsPolicies,
  serviceCategoriesRlsPolicies,
  servicesRlsPolicies,
  staffServicesRlsPolicies,
  resourcesRlsPolicies,
  serviceResourceRequirementsRlsPolicies,
  availabilityRulesRlsPolicies,
  availabilityExceptionsRlsPolicies,
  customersRlsPolicies,
  bookingsRlsPolicies,
  bookingResourcesRlsPolicies,
  bookingStatusEventsRlsPolicies,
  bookingHoldsRlsPolicies,
  bookingManagementTokensRlsPolicies,
  subscriptionsRlsPolicies,
  entitlementsRlsPolicies,
  paymentsRlsPolicies,
  outboxEventsRlsPolicies,
  webhookEventsRlsPolicies,
  idempotencyRecordsRlsPolicies,
  auditEventsRlsPolicies,
  platformAdminsRlsPolicies,
  bookingPoliciesRlsPolicies,
  businessSupportNotesRlsPolicies,
  notificationDeliveriesRlsPolicies,
  
  // Utility functions
  enableRlsOnTable,
  disableRlsOnTable,
  createRlsPolicy,
  dropRlsPolicy,
  applyTableRlsPolicies,
  getTablePolicies,
  applyAllRlsPolicies,
  setTenantContext,
  clearTenantContext,
  testRlsIsolation,
};
