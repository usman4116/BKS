/**
 * Clerk Authentication Unit Tests
 * 
 * Tests for Clerk integration and authentication utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCurrentUser,
  getCurrentSession,
  getUserOrganization,
  isPlatformAdminUser,
  provisionBusiness,
  linkUserToBusiness,
  getOnboardingState,
  checkPublishRequirements,
  publishBusiness,
  unpublishBusiness,
  handleClerkWebhook,
  ClerkWebhookPayload,
} from '../../src/infrastructure/auth/clerk';
import { db } from '../../src/infrastructure/db/client';
import * as schema from '../../src/infrastructure/db/schema';
import { testUtils } from '../setup';

// Mock Clerk
vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
  auth: vi.fn(),
  clerkClient: {
    users: {
      getUser: vi.fn(),
    },
    organizations: {
      getOrganization: vi.fn(),
      createOrganization: vi.fn(),
      createOrganizationMembership: vi.fn(),
    },
  },
}));

describe('Clerk Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCurrentUser', () => {
    it('should return null when no user is authenticated', async () => {
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue(null);

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('should return user data when authenticated', async () => {
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue({
        id: 'user_123',
        emailAddresses: [{ emailAddress: 'test@example.com' }],
        firstName: 'Test',
        lastName: 'User',
        imageUrl: 'https://example.com/avatar.jpg',
        username: 'testuser',
      });

      const user = await getCurrentUser();
      expect(user).toEqual({
        id: 'user_123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        imageUrl: 'https://example.com/avatar.jpg',
        username: 'testuser',
      });
    });

    it('should handle errors gracefully', async () => {
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockRejectedValue(new Error('Clerk error'));

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('getCurrentSession', () => {
    it('should return null when no user is authenticated', async () => {
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue(null);

      const session = await getCurrentSession();
      expect(session).toBeNull();
    });

    it('should return session with user but no organization', async () => {
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue({
        id: 'user_123',
        emailAddresses: [{ emailAddress: 'test@example.com' }],
        firstName: 'Test',
        lastName: 'User',
      });

      // Mock getUserOrganization to return null
      vi.mocked(getUserOrganization).mockResolvedValue(null);
      vi.mocked(isPlatformAdminUser).mockResolvedValue(false);

      const session = await getCurrentSession();
      expect(session).toEqual({
        user: {
          id: 'user_123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
        },
        organization: undefined,
        businessId: undefined,
        isPlatformAdmin: false,
        isBusinessUser: false,
        role: undefined,
      });
    });
  });

  describe('getUserOrganization', () => {
    it('should return null when user has no organization memberships', async () => {
      const { clerkClient } = await import('@clerk/nextjs/server');
      (clerkClient.users.getUser as jest.Mock).mockResolvedValue({
        organization_memberships: [],
      });

      const org = await getUserOrganization('user_123');
      expect(org).toBeNull();
    });

    it('should return organization when user has active membership', async () => {
      const { clerkClient } = await import('@clerk/nextjs/server');
      (clerkClient.users.getUser as jest.Mock).mockResolvedValue({
        organization_memberships: [
          {
            status: 'active',
            organization: { id: 'org_123' },
          },
        ],
      });
      (clerkClient.organizations.getOrganization as jest.Mock).mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        slug: 'test-org',
        created_at: '2024-01-01T00:00:00.000Z',
      });

      const org = await getUserOrganization('user_123');
      expect(org).toEqual({
        id: 'org_123',
        name: 'Test Org',
        slug: 'test-org',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('isPlatformAdminUser', () => {
    it('should return false when user is not a platform admin', async () => {
      // Mock database query to return no results
      vi.mocked(db.query.platformAdmins.findFirst).mockResolvedValue(undefined);

      const isAdmin = await isPlatformAdminUser('user_123');
      expect(isAdmin).toBe(false);
    });

    it('should return true when user is an active platform admin', async () => {
      // Mock database query to return a platform admin
      vi.mocked(db.query.platformAdmins.findFirst).mockResolvedValue({
        id: 'admin_123',
        externalAuthUserId: 'user_123',
        email: 'admin@example.com',
        role: 'platform_admin',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as schema.PlatformAdmin);

      const isAdmin = await isPlatformAdminUser('user_123');
      expect(isAdmin).toBe(true);
    });

    it('should return false when platform admin is disabled', async () => {
      // Mock database query to return a disabled platform admin
      vi.mocked(db.query.platformAdmins.findFirst).mockResolvedValue({
        id: 'admin_123',
        externalAuthUserId: 'user_123',
        email: 'admin@example.com',
        role: 'platform_admin',
        status: 'disabled',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as schema.PlatformAdmin);

      const isAdmin = await isPlatformAdminUser('user_123');
      expect(isAdmin).toBe(false);
    });
  });

  describe('provisionBusiness', () => {
    it('should create a new business with all required data', async () => {
      const context = {
        requestId: 'req_123',
        correlationId: 'corr_123',
      };

      // Mock Clerk organization creation
      const { clerkClient } = await import('@clerk/nextjs/server');
      (clerkClient.organizations.createOrganization as jest.Mock).mockResolvedValue({
        id: 'org_123',
        name: 'Test Business',
        slug: 'test-business',
      });
      (clerkClient.organizations.createOrganizationMembership as jest.Mock).mockResolvedValue({});

      // Mock database operations
      vi.mocked(db.insert(schema.businesses).values).mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'business_123',
          externalAuthOrgId: 'org_123',
          name: 'Test Business',
          slug: 'test-business',
          businessType: 'salon',
          timezone: 'Europe/London',
          currency: 'GBP',
          locale: 'en-GB',
          email: 'test@example.com',
          phoneE164: '+441234567890',
          status: 'draft',
          bookingPagePublished: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }] as [schema.Business]),
      } as unknown as ReturnType<typeof db.insert>);

      vi.mocked(db.insert(schema.businessUsers).values).mockResolvedValue({} as unknown as ReturnType<typeof db.insert>);
      vi.mocked(db.insert(schema.bookingPolicies).values).mockResolvedValue({} as unknown as ReturnType<typeof db.insert>);
      vi.mocked(db.insert(schema.entitlements).values).mockResolvedValue({} as unknown as ReturnType<typeof db.insert>);
      vi.mocked(db.insert(schema.auditEvents).values).mockResolvedValue({} as unknown as ReturnType<typeof db.insert>);

      const business = await provisionBusiness(
        'user_123',
        'org_123',
        {
          name: 'Test Business',
          slug: 'test-business',
          businessType: 'salon',
          timezone: 'Europe/London',
          currency: 'GBP',
          email: 'test@example.com',
          phoneE164: '+441234567890',
        },
        context
      );

      expect(business.id).toBe('business_123');
      expect(business.name).toBe('Test Business');
      expect(business.slug).toBe('test-business');
      expect(business.status).toBe('draft');
    });

    it('should throw error when business slug already exists', async () => {
      const context = {
        requestId: 'req_123',
        correlationId: 'corr_123',
      };

      // Mock existing business
      vi.mocked(db.query.businesses.findFirst).mockResolvedValue({
        id: 'existing_123',
        slug: 'test-business',
      } as schema.Business);

      await expect(provisionBusiness(
        'user_123',
        'org_123',
        {
          name: 'Test Business',
          slug: 'test-business',
        },
        context
      )).rejects.toThrow();
    });

    it('should throw error when user already has a business', async () => {
      const context = {
        requestId: 'req_123',
        correlationId: 'corr_123',
      };

      // Mock session with existing business
      const session = {
        user: { id: 'user_123' },
        businessId: 'existing_business_123',
      };

      // Mock getCurrentSession to return session with business
      vi.mocked(getCurrentSession).mockResolvedValue(session as unknown as ReturnType<typeof getCurrentSession>);

      await expect(provisionBusiness(
        'user_123',
        'org_123',
        {
          name: 'Test Business',
          slug: 'test-business',
        },
        context
      )).rejects.toThrow();
    });
  });

  describe('linkUserToBusiness', () => {
    it('should link user to business with owner role', async () => {
      const context = {
        requestId: 'req_123',
        correlationId: 'corr_123',
      };

      // Mock Clerk user
      const { clerkClient } = await import('@clerk/nextjs/server');
      (clerkClient.users.getUser as jest.Mock).mockResolvedValue({
        email_addresses: [{ email_address: 'test@example.com' }],
      });

      // Mock database operations
      vi.mocked(db.query.businessUsers.findFirst).mockResolvedValue(undefined);
      vi.mocked(db.insert(schema.businessUsers).values).mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'business_user_123',
          businessId: 'business_123',
          externalAuthUserId: 'user_123',
          role: 'owner',
          status: 'active',
          email: 'test@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        }] as [schema.BusinessUser]),
      } as unknown as ReturnType<typeof db.insert>);
      vi.mocked(db.insert(schema.auditEvents).values).mockResolvedValue({} as unknown as ReturnType<typeof db.insert>);

      const businessUser = await linkUserToBusiness(
        'user_123',
        'business_123',
        'owner',
        context
      );

      expect(businessUser.id).toBe('business_user_123');
      expect(businessUser.businessId).toBe('business_123');
      expect(businessUser.externalAuthUserId).toBe('user_123');
      expect(businessUser.role).toBe('owner');
    });

    it('should update existing link when role changes', async () => {
      const context = {
        requestId: 'req_123',
        correlationId: 'corr_123',
      };

      // Mock existing business user
      vi.mocked(db.query.businessUsers.findFirst).mockResolvedValue({
        id: 'business_user_123',
        businessId: 'business_123',
        externalAuthUserId: 'user_123',
        role: 'manager',
        status: 'active',
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as schema.BusinessUser);

      vi.mocked(db.update(schema.businessUsers).set).mockReturnValue({
        where: vi.fn(),
        returning: vi.fn().mockResolvedValue([{
          id: 'business_user_123',
          businessId: 'business_123',
          externalAuthUserId: 'user_123',
          role: 'owner',
          status: 'active',
          email: 'test@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        }] as [schema.BusinessUser]),
      } as unknown as ReturnType<typeof db.update>);

      const businessUser = await linkUserToBusiness(
        'user_123',
        'business_123',
        'owner',
        context
      );

      expect(businessUser.role).toBe('owner');
    });
  });

  describe('getOnboardingState', () => {
    it('should return onboarding state with all steps completed', async () => {
      // Mock business
      vi.mocked(db.query.businesses.findFirst).mockResolvedValue({
        id: 'business_123',
        bookingPagePublished: true,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as schema.Business);

      // Mock counts
      vi.mocked(db.query.locations.count).mockResolvedValue(1 as number);
      vi.mocked(db.query.staffProfiles.count).mockResolvedValue(1 as number);
      vi.mocked(db.query.services.count).mockResolvedValue(1 as number);
      vi.mocked(db.query.availabilityRules.count).mockResolvedValue(1 as number);
      vi.mocked(db.query.bookingPolicies.count).mockResolvedValue(1 as number);

      const state = await getOnboardingState('business_123');

      expect(state.businessId).toBe('business_123');
      expect(state.isComplete).toBe(true);
      expect(state.completedSteps).toContain('business_info');
      expect(state.completedSteps).toContain('location');
      expect(state.completedSteps).toContain('staff');
      expect(state.completedSteps).toContain('services');
      expect(state.completedSteps).toContain('availability');
      expect(state.completedSteps).toContain('policies');
    });

    it('should return missing requirements when steps are incomplete', async () => {
      // Mock business
      vi.mocked(db.query.businesses.findFirst).mockResolvedValue({
        id: 'business_123',
        bookingPagePublished: false,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as schema.Business);

      // Mock counts (some missing)
      vi.mocked(db.query.locations.count).mockResolvedValue(0 as number);
      vi.mocked(db.query.staffProfiles.count).mockResolvedValue(0 as number);
      vi.mocked(db.query.services.count).mockResolvedValue(0 as number);
      vi.mocked(db.query.availabilityRules.count).mockResolvedValue(0 as number);
      vi.mocked(db.query.bookingPolicies.count).mockResolvedValue(0 as number);

      const state = await getOnboardingState('business_123');

      expect(state.missingRequirements.length).toBeGreaterThan(0);
      expect(state.canPublish).toBe(false);
    });
  });

  describe('checkPublishRequirements', () => {
    it('should return canPublish true when all requirements are met', async () => {
      // Mock onboarding state
      vi.mocked(getOnboardingState).mockResolvedValue({
        businessId: 'business_123',
        currentStep: 'publish',
        completedSteps: ['business_info', 'location', 'staff', 'services', 'availability', 'policies'],
        isComplete: false,
        canPublish: true,
        missingRequirements: [],
      });

      const result = await checkPublishRequirements('business_123');
      expect(result.canPublish).toBe(true);
      expect(result.missingRequirements).toEqual([]);
    });

    it('should return canPublish false when requirements are missing', async () => {
      // Mock onboarding state
      vi.mocked(getOnboardingState).mockResolvedValue({
        businessId: 'business_123',
        currentStep: 'location',
        completedSteps: ['business_info'],
        isComplete: false,
        canPublish: false,
        missingRequirements: ['At least one active location is required'],
      });

      const result = await checkPublishRequirements('business_123');
      expect(result.canPublish).toBe(false);
      expect(result.missingRequirements.length).toBeGreaterThan(0);
    });
  });

  describe('handleClerkWebhook', () => {
    it('should process user.created webhook', async () => {
      const event: ClerkWebhookPayload = {
        id: 'evt_123',
        type: 'user.created',
        data: {
          id: 'user_123',
          email_addresses: [{ email_address: 'test@example.com' }],
        },
        object: 'user',
        created: Date.now(),
      };

      const result = await handleClerkWebhook(event, JSON.stringify(event), 'valid-signature');
      expect(result).toBeUndefined();
    });

    it('should process organization.created webhook', async () => {
      const event: ClerkWebhookPayload = {
        id: 'evt_123',
        type: 'organization.created',
        data: {
          id: 'org_123',
          name: 'Test Org',
          slug: 'test-org',
        },
        object: 'organization',
        created: Date.now(),
      };

      const result = await handleClerkWebhook(event, JSON.stringify(event), 'valid-signature');
      expect(result).toBeUndefined();
    });

    it('should handle invalid webhook signature in production', async () => {
      // Set environment to production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const event: ClerkWebhookPayload = {
        id: 'evt_123',
        type: 'user.created',
        data: {},
        object: 'user',
        created: Date.now(),
      };

      await expect(handleClerkWebhook(
        event, 
        JSON.stringify(event), 
        'invalid-signature'
      )).rejects.toThrow();

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });
});
