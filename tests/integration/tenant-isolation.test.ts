/**
 * Tenant Isolation Integration Tests
 * 
 * These tests verify that Row-Level Security (RLS) policies properly isolate tenants
 * as specified in PRD Section 11.2 and Section 19.4.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/infrastructure/db/schema';
import { 
  applyAllRlsPolicies, 
  setTenantContext, 
  clearTenantContext,
  testRlsIsolation 
} from '../../src/infrastructure/db/rls';
import { logger } from '../../src/infrastructure/observability/logger';

// Test database connection
let testDb: ReturnType<typeof drizzle>;
let testClient: postgres.Sql;

// Test business IDs
const BUSINESS_A_ID = '00000000-0000-0000-0000-000000000001';
const BUSINESS_B_ID = '00000000-0000-0000-0000-000000000002';

// Test user IDs
const USER_A_ID = 'user_a_123';
const USER_B_ID = 'user_b_456';
const PLATFORM_ADMIN_ID = 'platform_admin_1';

describe('Tenant Isolation Tests', () => {
  beforeAll(async () => {
    // Set up test database connection
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:test@localhost:5432/test';
    testClient = postgres(connectionString);
    testDb = drizzle(testClient, { schema });
    
    // Apply RLS policies
    await applyAllRlsPolicies();
    
    logger.info('Test database connection established');
  });

  afterAll(async () => {
    // Clean up
    await testClient.end();
    clearTenantContext();
    logger.info('Test database connection closed');
  });

  beforeEach(() => {
    // Clear context before each test
    clearTenantContext();
  });

  describe('RLS Policy Application', () => {
    it('should have RLS enabled on all tenant tables', async () => {
      const tablesWithRls = [
        'businesses',
        'business_users',
        'locations',
        'staff_profiles',
        'service_categories',
        'services',
        'staff_services',
        'resources',
        'service_resource_requirements',
        'availability_rules',
        'availability_exceptions',
        'customers',
        'bookings',
        'booking_resources',
        'booking_status_events',
        'booking_holds',
        'booking_management_tokens',
        'subscriptions',
        'entitlements',
        'payments',
        'outbox_events',
        'webhook_events',
        'idempotency_records',
        'audit_events',
        'platform_admins',
        'booking_policies',
        'business_support_notes',
        'notification_deliveries',
      ];

      for (const tableName of tablesWithRls) {
        const result = await testDb.execute<{ row_security: boolean }>(
          schema.sql`SELECT row_security FROM information_schema.tables WHERE table_name = ${tableName}`
        );
        
        expect(result.rows[0]?.row_security).toBe(true);
      }
    });

    it('should have policies defined for all tenant tables', async () => {
      const tablesWithPolicies = [
        'businesses',
        'business_users',
        'locations',
        'staff_profiles',
        'service_categories',
        'services',
        'staff_services',
        'resources',
        'service_resource_requirements',
        'availability_rules',
        'availability_exceptions',
        'customers',
        'bookings',
        'booking_resources',
        'booking_status_events',
        'booking_holds',
        'booking_management_tokens',
        'subscriptions',
        'entitlements',
        'payments',
        'outbox_events',
        'webhook_events',
        'idempotency_records',
        'audit_events',
        'platform_admins',
        'booking_policies',
        'business_support_notes',
        'notification_deliveries',
      ];

      for (const tableName of tablesWithPolicies) {
        const result = await testDb.execute<{ policyname: string }>(
          schema.sql`SELECT policyname FROM pg_policies WHERE tablename = ${tableName}`
        );
        
        expect(result.rows.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Business Isolation', () => {
    it('should prevent Business A from reading Business B data', async () => {
      // Set context for Business A user
      setTenantContext({
        businessId: BUSINESS_A_ID,
        userId: USER_A_ID,
        isBusinessUser: true,
        isPlatformAdmin: false,
      });

      // Try to query Business B's data
      const result = await testDb.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.id, BUSINESS_B_ID),
      });

      // Should return null (no access)
      expect(result).toBeUndefined();
    });

    it('should allow Business A to read their own data', async () => {
      // Set context for Business A user
      setTenantContext({
        businessId: BUSINESS_A_ID,
        userId: USER_A_ID,
        isBusinessUser: true,
        isPlatformAdmin: false,
      });

      // Try to query Business A's data
      const result = await testDb.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.id, BUSINESS_A_ID),
      });

      // Should return the business
      expect(result).toBeDefined();
      expect(result?.id).toBe(BUSINESS_A_ID);
    });

    it('should allow platform admin to read any business data', async () => {
      // Set context for platform admin
      setTenantContext({
        businessId: undefined,
        userId: PLATFORM_ADMIN_ID,
        isBusinessUser: false,
        isPlatformAdmin: true,
      });

      // Try to query Business A's data
      const resultA = await testDb.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.id, BUSINESS_A_ID),
      });

      // Try to query Business B's data
      const resultB = await testDb.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.id, BUSINESS_B_ID),
      });

      // Should return both businesses
      expect(resultA).toBeDefined();
      expect(resultB).toBeDefined();
    });
  });

  describe('Cross-Tenant Write Prevention', () => {
    it('should prevent Business A from inserting data with Business B ID', async () => {
      // Set context for Business A user
      setTenantContext({
        businessId: BUSINESS_A_ID,
        userId: USER_A_ID,
        isBusinessUser: true,
        isPlatformAdmin: false,
      });

      // Try to insert a location with Business B ID
      try {
        await testDb.insert(schema.locations).values({
          id: 'test-location-id',
          businessId: BUSINESS_B_ID, // This should be rejected
          name: 'Test Location',
          city: 'Test City',
          countryCode: 'GB',
          isPrimary: true,
          isActive: true,
          displayOrder: 0,
        });
        
        // If we get here, the test failed
        expect.fail('Should have thrown an error');
      } catch (error) {
        // Should throw a permission error
        expect(error).toBeDefined();
      }
    });

    it('should allow Business A to insert data with their own ID', async () => {
      // Set context for Business A user
      setTenantContext({
        businessId: BUSINESS_A_ID,
        userId: USER_A_ID,
        isBusinessUser: true,
        isPlatformAdmin: false,
      });

      // Try to insert a location with Business A ID
      const [location] = await testDb.insert(schema.locations).values({
        id: 'test-location-id',
        businessId: BUSINESS_A_ID,
        name: 'Test Location',
        city: 'Test City',
        countryCode: 'GB',
        isPrimary: true,
        isActive: true,
        displayOrder: 0,
      }).returning();

      expect(location).toBeDefined();
      expect(location.businessId).toBe(BUSINESS_A_ID);
      
      // Clean up
      await testDb.delete(schema.locations).where(
        schema.eq(schema.locations.id, location.id)
      );
    });
  });

  describe('Public Access Policies', () => {
    it('should allow public access to published businesses', async () => {
      // Clear business user context (simulate public user)
      setTenantContext({
        businessId: undefined,
        userId: undefined,
        isBusinessUser: false,
        isPlatformAdmin: false,
      });

      // Create a published business for testing
      const [publishedBusiness] = await testDb.insert(schema.businesses).values({
        id: 'published-business-id',
        externalAuthOrgId: 'published-org-id',
        name: 'Published Business',
        slug: 'published-business',
        businessType: 'salon',
        timezone: 'Europe/London',
        currency: 'GBP',
        email: 'published@example.com',
        phoneE164: '+441234567890',
        bookingPagePublished: true,
        status: 'active',
      }).returning();

      // Try to query the published business
      const result = await testDb.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.id, publishedBusiness.id),
      });

      // Should return the published business
      expect(result).toBeDefined();
      expect(result?.id).toBe(publishedBusiness.id);
      
      // Clean up
      await testDb.delete(schema.businesses).where(
        schema.eq(schema.businesses.id, publishedBusiness.id)
      );
    });

    it('should prevent public access to unpublished businesses', async () => {
      // Clear business user context (simulate public user)
      setTenantContext({
        businessId: undefined,
        userId: undefined,
        isBusinessUser: false,
        isPlatformAdmin: false,
      });

      // Create an unpublished business for testing
      const [unpublishedBusiness] = await testDb.insert(schema.businesses).values({
        id: 'unpublished-business-id',
        externalAuthOrgId: 'unpublished-org-id',
        name: 'Unpublished Business',
        slug: 'unpublished-business',
        businessType: 'salon',
        timezone: 'Europe/London',
        currency: 'GBP',
        email: 'unpublished@example.com',
        phoneE164: '+441234567890',
        bookingPagePublished: false,
        status: 'draft',
      }).returning();

      // Try to query the unpublished business
      const result = await testDb.query.businesses.findFirst({
        where: (businesses, { eq }) => eq(businesses.id, unpublishedBusiness.id),
      });

      // Should return null (no access)
      expect(result).toBeUndefined();
      
      // Clean up
      await testDb.delete(schema.businesses).where(
        schema.eq(schema.businesses.id, unpublishedBusiness.id)
      );
    });

    it('should allow public access to public staff profiles', async () => {
      // Clear business user context (simulate public user)
      setTenantContext({
        businessId: undefined,
        userId: undefined,
        isBusinessUser: false,
        isPlatformAdmin: false,
      });

      // Create a published business
      const [business] = await testDb.insert(schema.businesses).values({
        id: 'public-staff-business-id',
        externalAuthOrgId: 'public-staff-org-id',
        name: 'Public Staff Business',
        slug: 'public-staff-business',
        businessType: 'salon',
        timezone: 'Europe/London',
        currency: 'GBP',
        email: 'publicstaff@example.com',
        phoneE164: '+441234567890',
        bookingPagePublished: true,
        status: 'active',
      }).returning();

      // Create a public staff profile
      const [staff] = await testDb.insert(schema.staffProfiles).values({
        id: 'public-staff-id',
        businessId: business.id,
        displayName: 'Public Staff Member',
        isPublic: true,
        isActive: true,
        displayOrder: 0,
      }).returning();

      // Try to query the public staff profile
      const result = await testDb.query.staffProfiles.findFirst({
        where: (profiles, { eq }) => eq(profiles.id, staff.id),
      });

      // Should return the public staff profile
      expect(result).toBeDefined();
      expect(result?.id).toBe(staff.id);
      
      // Clean up
      await testDb.delete(schema.staffProfiles).where(
        schema.eq(schema.staffProfiles.id, staff.id)
      );
      await testDb.delete(schema.businesses).where(
        schema.eq(schema.businesses.id, business.id)
      );
    });

    it('should prevent public access to private staff profiles', async () => {
      // Clear business user context (simulate public user)
      setTenantContext({
        businessId: undefined,
        userId: undefined,
        isBusinessUser: false,
        isPlatformAdmin: false,
      });

      // Create a published business
      const [business] = await testDb.insert(schema.businesses).values({
        id: 'private-staff-business-id',
        externalAuthOrgId: 'private-staff-org-id',
        name: 'Private Staff Business',
        slug: 'private-staff-business',
        businessType: 'salon',
        timezone: 'Europe/London',
        currency: 'GBP',
        email: 'privatestaff@example.com',
        phoneE164: '+441234567890',
        bookingPagePublished: true,
        status: 'active',
      }).returning();

      // Create a private staff profile
      const [staff] = await testDb.insert(schema.staffProfiles).values({
        id: 'private-staff-id',
        businessId: business.id,
        displayName: 'Private Staff Member',
        isPublic: false, // Private
        isActive: true,
        displayOrder: 0,
      }).returning();

      // Try to query the private staff profile
      const result = await testDb.query.staffProfiles.findFirst({
        where: (profiles, { eq }) => eq(profiles.id, staff.id),
      });

      // Should return null (no access)
      expect(result).toBeUndefined();
      
      // Clean up
      await testDb.delete(schema.staffProfiles).where(
        schema.eq(schema.staffProfiles.id, staff.id)
      );
      await testDb.delete(schema.businesses).where(
        schema.eq(schema.businesses.id, business.id)
      );
    });
  });

  describe('Platform Admin Access', () => {
    it('should allow platform admin to access all businesses', async () => {
      // Set context for platform admin
      setTenantContext({
        businessId: undefined,
        userId: PLATFORM_ADMIN_ID,
        isBusinessUser: false,
        isPlatformAdmin: true,
      });

      // Create test businesses
      const [businessA] = await testDb.insert(schema.businesses).values({
        id: 'platform-admin-test-a',
        externalAuthOrgId: 'platform-admin-org-a',
        name: 'Platform Admin Test A',
        slug: 'platform-admin-test-a',
        businessType: 'salon',
        timezone: 'Europe/London',
        currency: 'GBP',
        email: 'test-a@example.com',
        phoneE164: '+441234567890',
        status: 'active',
      }).returning();

      const [businessB] = await testDb.insert(schema.businesses).values({
        id: 'platform-admin-test-b',
        externalAuthOrgId: 'platform-admin-org-b',
        name: 'Platform Admin Test B',
        slug: 'platform-admin-test-b',
        businessType: 'salon',
        timezone: 'Europe/London',
        currency: 'GBP',
        email: 'test-b@example.com',
        phoneE164: '+441234567890',
        status: 'active',
      }).returning();

      // Query all businesses
      const allBusinesses = await testDb.query.businesses.findMany();

      // Should return all businesses
      expect(allBusinesses.length).toBeGreaterThanOrEqual(2);
      
      const foundA = allBusinesses.find(b => b.id === businessA.id);
      const foundB = allBusinesses.find(b => b.id === businessB.id);
      
      expect(foundA).toBeDefined();
      expect(foundB).toBeDefined();
      
      // Clean up
      await testDb.delete(schema.businesses).where(
        schema.inArray(schema.businesses.id, [businessA.id, businessB.id])
      );
    });

    it('should allow platform admin to access all business users', async () => {
      // Set context for platform admin
      setTenantContext({
        businessId: undefined,
        userId: PLATFORM_ADMIN_ID,
        isBusinessUser: false,
        isPlatformAdmin: true,
      });

      // Create test business
      const [business] = await testDb.insert(schema.businesses).values({
        id: 'platform-admin-business-users-test',
        externalAuthOrgId: 'platform-admin-business-users-org',
        name: 'Platform Admin Business Users Test',
        slug: 'platform-admin-business-users-test',
        businessType: 'salon',
        timezone: 'Europe/London',
        currency: 'GBP',
        email: 'test@example.com',
        phoneE164: '+441234567890',
        status: 'active',
      }).returning();

      // Create test business user
      const [businessUser] = await testDb.insert(schema.businessUsers).values({
        id: 'platform-admin-business-user-id',
        businessId: business.id,
        externalAuthUserId: 'test-business-user-id',
        role: 'owner',
        status: 'active',
        email: 'business-user@example.com',
      }).returning();

      // Query the business user
      const result = await testDb.query.businessUsers.findFirst({
        where: (users, { eq }) => eq(users.id, businessUser.id),
      });

      // Should return the business user
      expect(result).toBeDefined();
      expect(result?.id).toBe(businessUser.id);
      
      // Clean up
      await testDb.delete(schema.businessUsers).where(
        schema.eq(schema.businessUsers.id, businessUser.id)
      );
      await testDb.delete(schema.businesses).where(
        schema.eq(schema.businesses.id, business.id)
      );
    });
  });

  describe('RLS Utility Functions', () => {
    it('should test RLS isolation correctly', async () => {
      // This test verifies that the testRlsIsolation function works
      const isIsolated = await testRlsIsolation(
        'businesses',
        BUSINESS_B_ID,
        BUSINESS_A_ID
      );

      // Should return true (isolated)
      expect(isIsolated).toBe(true);
    });
  });
});

describe('Tenant Isolation Edge Cases', () => {
  beforeAll(async () => {
    // Set up test database connection
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:test@localhost:5432/test';
    testClient = postgres(connectionString);
    testDb = drizzle(testClient, { schema });
    
    // Apply RLS policies
    await applyAllRlsPolicies();
  });

  afterAll(async () => {
    // Clean up
    await testClient.end();
    clearTenantContext();
  });

  beforeEach(() => {
    // Clear context before each test
    clearTenantContext();
  });

  it('should handle null business context gracefully', async () => {
    // Set context with no business ID
    setTenantContext({
      businessId: undefined,
      userId: undefined,
      isBusinessUser: false,
      isPlatformAdmin: false,
    });

    // Try to query businesses
    const result = await testDb.query.businesses.findFirst();

    // Should return null (no access without proper context)
    expect(result).toBeUndefined();
  });

  it('should handle concurrent requests with different contexts', async () => {
    // This test verifies that context is properly isolated between requests
    
    // Set context for Business A
    setTenantContext({
      businessId: BUSINESS_A_ID,
      userId: USER_A_ID,
      isBusinessUser: true,
      isPlatformAdmin: false,
    });

    // Query for Business A
    const resultA = await testDb.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.id, BUSINESS_A_ID),
    });

    // Clear and set context for Business B
    clearTenantContext();
    setTenantContext({
      businessId: BUSINESS_B_ID,
      userId: USER_B_ID,
      isBusinessUser: true,
      isPlatformAdmin: false,
    });

    // Query for Business B
    const resultB = await testDb.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.id, BUSINESS_B_ID),
    });

    // Each should only see their own business
    expect(resultA).toBeDefined();
    expect(resultA?.id).toBe(BUSINESS_A_ID);
    
    expect(resultB).toBeDefined();
    expect(resultB?.id).toBe(BUSINESS_B_ID);
    
    // Verify cross-access is prevented
    const crossAccessA = await testDb.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.id, BUSINESS_B_ID),
    });
    
    const crossAccessB = await testDb.query.businesses.findFirst({
      where: (businesses, { eq }) => eq(businesses.id, BUSINESS_A_ID),
    });
    
    expect(crossAccessA).toBeUndefined();
    expect(crossAccessB).toBeUndefined();
  });
});