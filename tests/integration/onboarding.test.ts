/**
 * Onboarding Integration Tests
 * 
 * Tests for the business onboarding flow as specified in PRD Section UC-001
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { POST, GET } from '../../src/app/api/v1/businesses/onboarding/route';
import { NextRequest } from 'next/server';
import { db } from '../../src/infrastructure/db/client';
import * as schema from '../../src/infrastructure/db/schema';
import { testUtils } from '../setup';
import { v4 as uuidv4 } from 'uuid';

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

describe('Onboarding API', () => {
  let testBusinessId: string;
  let testUserId: string;
  let testOrganizationId: string;

  beforeAll(async () => {
    // Create test data
    testBusinessId = uuidv4();
    testUserId = 'test_user_123';
    testOrganizationId = 'test_org_123';

    // Create test business
    await db.insert(schema.businesses).values({
      id: testBusinessId,
      externalAuthOrgId: testOrganizationId,
      name: 'Test Business',
      slug: 'test-business-onboarding',
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
    });

    // Create test business user
    await db.insert(schema.businessUsers).values({
      id: uuidv4(),
      businessId: testBusinessId,
      externalAuthUserId: testUserId,
      role: 'owner',
      status: 'active',
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(schema.businessUsers).where(
      schema.eq(schema.businessUsers.businessId, testBusinessId)
    );
    await db.delete(schema.businesses).where(
      schema.eq(schema.businesses.id, testBusinessId)
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/businesses/onboarding', () => {
    it('should create a new business and return onboarding state', async () => {
      // Mock Clerk session
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue({
        id: testUserId,
        emailAddresses: [{ emailAddress: 'test@example.com' }],
        firstName: 'Test',
        lastName: 'User',
      });

      // Mock organization creation
      const { clerkClient } = await import('@clerk/nextjs/server');
      (clerkClient.organizations.createOrganization as jest.Mock).mockResolvedValue({
        id: 'new_org_123',
        name: 'New Business',
        slug: 'new-business',
      });
      (clerkClient.organizations.createOrganizationMembership as jest.Mock).mockResolvedValue({});

      // Create request
      const request = new NextRequest('http://localhost:3000/api/v1/businesses/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Business',
          slug: 'new-business',
          businessType: 'salon',
          timezone: 'Europe/London',
          currency: 'GBP',
          email: 'new@example.com',
          phoneE164: '+441234567891',
        }),
      });

      // Call the endpoint
      const response = await POST(request);

      // Check response
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('business');
      expect(data.data.business).toHaveProperty('id');
      expect(data.data.business).toHaveProperty('name', 'New Business');
      expect(data.data.business).toHaveProperty('slug', 'new-business');
      expect(data.data.business).toHaveProperty('status', 'draft');
      expect(data.data.business).toHaveProperty('bookingPagePublished', false);
      expect(data.data).toHaveProperty('onboarding');
      expect(data.data.onboarding).toHaveProperty('currentStep');
      expect(data.data.onboarding).toHaveProperty('completedSteps');
      expect(data.data.onboarding).toHaveProperty('isComplete', false);
    });

    it('should return validation error for invalid request body', async () => {
      // Mock Clerk session
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue({
        id: testUserId,
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // Create request with invalid body
      const request = new NextRequest('http://localhost:3000/api/v1/businesses/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '', // Invalid: too short
          slug: 'invalid slug', // Invalid: contains space
        }),
      });

      // Call the endpoint
      const response = await POST(request);

      // Check response
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(data.error).toHaveProperty('field_errors');
      expect(data.error.field_errors.length).toBeGreaterThan(0);
    });

    it('should return conflict error for duplicate slug', async () => {
      // Mock Clerk session
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue({
        id: 'new_user_123', // Different user
        emailAddresses: [{ emailAddress: 'new@example.com' }],
      });

      // Mock organization creation
      const { clerkClient } = await import('@clerk/nextjs/server');
      (clerkClient.organizations.createOrganization as jest.Mock).mockResolvedValue({
        id: 'new_org_123',
        name: 'Duplicate Business',
        slug: 'test-business-onboarding', // Same slug as existing
      });
      (clerkClient.organizations.createOrganizationMembership as jest.Mock).mockResolvedValue({});

      // Create request with duplicate slug
      const request = new NextRequest('http://localhost:3000/api/v1/businesses/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Duplicate Business',
          slug: 'test-business-onboarding', // Duplicate
          businessType: 'salon',
          timezone: 'Europe/London',
          currency: 'GBP',
          email: 'new@example.com',
          phoneE164: '+441234567891',
        }),
      });

      // Call the endpoint
      const response = await POST(request);

      // Check response
      expect(response.status).toBe(409);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('code', 'BOOKING_TIME_UNAVAILABLE'); // Conflict error
    });

    it('should return authentication error when not authenticated', async () => {
      // Mock Clerk session to return null
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue(null);

      // Create request
      const request = new NextRequest('http://localhost:3000/api/v1/businesses/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Business',
          slug: 'new-business',
        }),
      });

      // Call the endpoint
      const response = await POST(request);

      // Check response
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('code', 'AUTH_REQUIRED');
    });
  });

  describe('GET /api/v1/businesses/onboarding', () => {
    it('should return onboarding state for authenticated user', async () => {
      // Mock Clerk session
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue({
        id: testUserId,
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // Mock getUserOrganization to return organization
      const { getUserOrganization } = await import('../../src/infrastructure/auth/clerk');
      vi.mocked(getUserOrganization).mockResolvedValue({
        id: testOrganizationId,
        name: 'Test Org',
        slug: 'test-org',
        createdAt: new Date().toISOString(),
      });

      // Create request
      const request = new NextRequest('http://localhost:3000/api/v1/businesses/onboarding', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Call the endpoint
      const response = await GET(request);

      // Check response
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('business');
      expect(data.data.business).toHaveProperty('id', testBusinessId);
      expect(data.data.business).toHaveProperty('name', 'Test Business');
      expect(data.data.business).toHaveProperty('slug', 'test-business-onboarding');
      expect(data.data).toHaveProperty('onboarding');
      expect(data.data.onboarding).toHaveProperty('currentStep');
      expect(data.data.onboarding).toHaveProperty('completedSteps');
    });

    it('should return authentication error when not authenticated', async () => {
      // Mock Clerk session to return null
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue(null);

      // Create request
      const request = new NextRequest('http://localhost:3000/api/v1/businesses/onboarding', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Call the endpoint
      const response = await GET(request);

      // Check response
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('code', 'AUTH_REQUIRED');
    });

    it('should return error when user has no business', async () => {
      // Mock Clerk session with user but no business
      const { currentUser } = await import('@clerk/nextjs/server');
      (currentUser as jest.Mock).mockResolvedValue({
        id: 'new_user_123', // User without business
        emailAddresses: [{ emailAddress: 'new@example.com' }],
      });

      // Mock getUserOrganization to return null
      const { getUserOrganization } = await import('../../src/infrastructure/auth/clerk');
      vi.mocked(getUserOrganization).mockResolvedValue(null);

      // Create request
      const request = new NextRequest('http://localhost:3000/api/v1/businesses/onboarding', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Call the endpoint
      const response = await GET(request);

      // Check response
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('code', 'VALIDATION_FAILED');
    });
  });
});

describe('Onboarding State Management', () => {
  let testBusinessId: string;

  beforeAll(async () => {
    // Create test business
    testBusinessId = uuidv4();

    await db.insert(schema.businesses).values({
      id: testBusinessId,
      externalAuthOrgId: 'test_org_123',
      name: 'Test Business',
      slug: 'test-business-state',
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
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(schema.locations).where(
      schema.eq(schema.locations.businessId, testBusinessId)
    );
    await db.delete(schema.staffProfiles).where(
      schema.eq(schema.staffProfiles.businessId, testBusinessId)
    );
    await db.delete(schema.services).where(
      schema.eq(schema.services.businessId, testBusinessId)
    );
    await db.delete(schema.availabilityRules).where(
      schema.eq(schema.availabilityRules.businessId, testBusinessId)
    );
    await db.delete(schema.bookingPolicies).where(
      schema.eq(schema.bookingPolicies.businessId, testBusinessId)
    );
    await db.delete(schema.businesses).where(
      schema.eq(schema.businesses.id, testBusinessId)
    );
  });

  it('should return incomplete onboarding state when business is missing requirements', async () => {
    const { getOnboardingState } = await import('../../src/infrastructure/auth/clerk');

    const state = await getOnboardingState(testBusinessId);

    expect(state.businessId).toBe(testBusinessId);
    expect(state.isComplete).toBe(false);
    expect(state.canPublish).toBe(false);
    expect(state.missingRequirements.length).toBeGreaterThan(0);
  });

  it('should return complete onboarding state when all requirements are met', async () => {
    const { getOnboardingState } = await import('../../src/infrastructure/auth/clerk');

    // Add required data
    const locationId = uuidv4();
    await db.insert(schema.locations).values({
      id: locationId,
      businessId: testBusinessId,
      name: 'Main Location',
      city: 'London',
      countryCode: 'GB',
      isPrimary: true,
      isActive: true,
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const staffId = uuidv4();
    await db.insert(schema.staffProfiles).values({
      id: staffId,
      businessId: testBusinessId,
      displayName: 'Test Staff',
      isActive: true,
      isPublic: true,
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const serviceId = uuidv4();
    await db.insert(schema.services).values({
      id: serviceId,
      businessId: testBusinessId,
      name: 'Test Service',
      durationMinutes: 30,
      priceMinor: 2500,
      currency: 'GBP',
      isActive: true,
      isPublic: true,
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.availabilityRules).values({
      id: uuidv4(),
      businessId: testBusinessId,
      staffProfileId: staffId,
      dayOfWeek: '1',
      localStartTime: '09:00:00',
      localEndTime: '17:00:00',
      effectiveFrom: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.bookingPolicies).values({
      id: uuidv4(),
      businessId: testBusinessId,
      version: 1,
      minimumNoticeMinutes: 60,
      bookingHorizonDays: 60,
      cancellationNoticeMinutes: 1440,
      isActive: true,
      effectiveFrom: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const state = await getOnboardingState(testBusinessId);

    expect(state.businessId).toBe(testBusinessId);
    expect(state.completedSteps).toContain('location');
    expect(state.completedSteps).toContain('staff');
    expect(state.completedSteps).toContain('services');
    expect(state.completedSteps).toContain('availability');
    expect(state.completedSteps).toContain('policies');
    expect(state.canPublish).toBe(true);
  });
});
