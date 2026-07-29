/**
 * Database Seed Script
 * 
 * This script seeds the database with demo data for development and testing.
 * Run with: npm run db:seed
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { db as queryDb } from './client';
import * as schema from './schema';
import { logger } from '../observability/logger';
import { v4 as uuidv4 } from 'uuid';

// Demo business data
const DEMO_BUSINESSES = [
  {
    name: 'Elegant Cuts Salon',
    slug: 'elegant-cuts',
    businessType: 'salon',
    timezone: 'Europe/London',
    currency: 'GBP',
    locale: 'en-GB',
    email: 'info@elegantcuts.co.uk',
    phoneE164: '+442071234567',
    logoUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200&h=200&fit=crop',
    primaryColor: '#8B4513',
    accentColor: '#D2B48C',
    bookingPagePublished: true,
    bookingHorizonDays: 60,
    minimumNoticeMinutes: 60,
    cancellationNoticeMinutes: 1440,
    slotIncrementMinutes: 15,
  },
  {
    name: 'Gentlemen\'s Quarter Barbers',
    slug: 'gentlemens-quarter',
    businessType: 'barbershop',
    timezone: 'Europe/London',
    currency: 'GBP',
    locale: 'en-GB',
    email: 'book@gentlemensquarter.com',
    phoneE164: '+442079876543',
    logoUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=200&h=200&fit=crop',
    primaryColor: '#2C3E50',
    accentColor: '#E74C3C',
    bookingPagePublished: true,
    bookingHorizonDays: 60,
    minimumNoticeMinutes: 30,
    cancellationNoticeMinutes: 720,
    slotIncrementMinutes: 15,
  },
];

// Demo locations for each business
const DEMO_LOCATIONS = [
  {
    businessIndex: 0,
    name: 'Main Salon',
    addressLine1: '123 High Street',
    city: 'London',
    region: 'Greater London',
    postalCode: 'W1A 1AA',
    countryCode: 'GB',
    phoneE164: '+442071234567',
    isPrimary: true,
    isActive: true,
    isVirtual: false,
    publicInstructions: 'Enter through the main entrance. Free parking available.',
    displayOrder: 0,
  },
  {
    businessIndex: 1,
    name: 'Flagship Barbershop',
    addressLine1: '456 Kings Road',
    city: 'London',
    region: 'Greater London',
    postalCode: 'SW1A 1BB',
    countryCode: 'GB',
    phoneE164: '+442079876543',
    isPrimary: true,
    isActive: true,
    isVirtual: false,
    publicInstructions: 'Walk-in appointments welcome. Cash and card accepted.',
    displayOrder: 0,
  },
];

// Demo staff profiles
const DEMO_STAFF = [
  // Elegant Cuts Salon staff
  {
    businessIndex: 0,
    displayName: 'Sarah Johnson',
    bio: 'Senior stylist with 10+ years experience specializing in precision cuts and color transformations.',
    photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    isActive: true,
    isPublic: true,
    displayOrder: 0,
    color: '#FF6B6B',
  },
  {
    businessIndex: 0,
    displayName: 'Emma Davis',
    bio: 'Creative stylist expert in balayage, highlights, and bridal styling.',
    photoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
    isActive: true,
    isPublic: true,
    displayOrder: 1,
    color: '#4ECDC4',
  },
  {
    businessIndex: 0,
    displayName: 'Michael Brown',
    bio: 'Men\'s grooming specialist with expertise in fades, tapers, and beard styling.',
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
    isActive: true,
    isPublic: true,
    displayOrder: 2,
    color: '#45B7D1',
  },
  // Gentlemen's Quarter staff
  {
    businessIndex: 1,
    displayName: 'James Wilson',
    bio: 'Master barber with 15 years experience. Specializes in classic and modern cuts.',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
    isActive: true,
    isPublic: true,
    displayOrder: 0,
    color: '#2C3E50',
  },
  {
    businessIndex: 1,
    displayName: 'David Taylor',
    bio: 'Expert in hot towel shaves, beard trims, and traditional barbering techniques.',
    photoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&h=200&fit=crop',
    isActive: true,
    isPublic: true,
    displayOrder: 1,
    color: '#E74C3C',
  },
];

// Demo service categories
const DEMO_SERVICE_CATEGORIES = [
  // Elegant Cuts Salon categories
  {
    businessIndex: 0,
    name: 'Hair Services',
    description: 'Professional hair cutting and styling services',
    displayOrder: 0,
    isActive: true,
  },
  {
    businessIndex: 0,
    name: 'Color Services',
    description: 'Hair coloring, highlights, and treatments',
    displayOrder: 1,
    isActive: true,
  },
  {
    businessIndex: 0,
    name: 'Treatments',
    description: 'Hair treatments and conditioning services',
    displayOrder: 2,
    isActive: true,
  },
  // Gentlemen's Quarter categories
  {
    businessIndex: 1,
    name: 'Haircuts',
    description: 'Professional men\'s haircuts',
    displayOrder: 0,
    isActive: true,
  },
  {
    businessIndex: 1,
    name: 'Grooming',
    description: 'Beard trims and facial grooming',
    displayOrder: 1,
    isActive: true,
  },
];

// Demo services
const DEMO_SERVICES = [
  // Elegant Cuts Salon services
  {
    businessIndex: 0,
    categoryIndex: 0,
    name: 'Women\'s Haircut & Style',
    description: 'Professional cut and blow-dry style',
    durationMinutes: 45,
    prepBufferMinutes: 5,
    cleanupBufferMinutes: 10,
    priceMinor: 4500, // £45.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 0,
  },
  {
    businessIndex: 0,
    categoryIndex: 0,
    name: 'Men\'s Haircut',
    description: 'Precision cut and styling',
    durationMinutes: 30,
    prepBufferMinutes: 5,
    cleanupBufferMinutes: 5,
    priceMinor: 2500, // £25.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 1,
  },
  {
    businessIndex: 0,
    categoryIndex: 0,
    name: 'Children\'s Haircut',
    description: 'Haircut for children under 12',
    durationMinutes: 25,
    prepBufferMinutes: 5,
    cleanupBufferMinutes: 5,
    priceMinor: 1800, // £18.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 2,
  },
  {
    businessIndex: 0,
    categoryIndex: 1,
    name: 'Full Highlights',
    description: 'Full head highlights with toning',
    durationMinutes: 120,
    prepBufferMinutes: 10,
    cleanupBufferMinutes: 15,
    priceMinor: 8500, // £85.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 0,
  },
  {
    businessIndex: 0,
    categoryIndex: 1,
    name: 'Balayage',
    description: 'Hand-painted highlighting technique',
    durationMinutes: 90,
    prepBufferMinutes: 10,
    cleanupBufferMinutes: 15,
    priceMinor: 7500, // £75.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 1,
  },
  {
    businessIndex: 0,
    categoryIndex: 2,
    name: 'Deep Conditioning Treatment',
    description: 'Intensive hair conditioning treatment',
    durationMinutes: 30,
    prepBufferMinutes: 5,
    cleanupBufferMinutes: 5,
    priceMinor: 3500, // £35.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 0,
  },
  // Gentlemen's Quarter services
  {
    businessIndex: 1,
    categoryIndex: 0,
    name: 'Classic Haircut',
    description: 'Traditional scissor cut with styling',
    durationMinutes: 30,
    prepBufferMinutes: 5,
    cleanupBufferMinutes: 5,
    priceMinor: 2200, // £22.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 0,
  },
  {
    businessIndex: 1,
    categoryIndex: 0,
    name: 'Fade Haircut',
    description: 'Modern fade with clipper work',
    durationMinutes: 40,
    prepBufferMinutes: 5,
    cleanupBufferMinutes: 10,
    priceMinor: 2800, // £28.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 1,
  },
  {
    businessIndex: 1,
    categoryIndex: 0,
    name: 'Skin Fade',
    description: 'Close fade with skin exposure',
    durationMinutes: 45,
    prepBufferMinutes: 5,
    cleanupBufferMinutes: 10,
    priceMinor: 3200, // £32.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 2,
  },
  {
    businessIndex: 1,
    categoryIndex: 1,
    name: 'Hot Towel Shave',
    description: 'Traditional straight razor shave with hot towel',
    durationMinutes: 30,
    prepBufferMinutes: 10,
    cleanupBufferMinutes: 10,
    priceMinor: 2500, // £25.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 0,
  },
  {
    businessIndex: 1,
    categoryIndex: 1,
    name: 'Beard Trim & Shape',
    description: 'Professional beard trimming and shaping',
    durationMinutes: 20,
    prepBufferMinutes: 5,
    cleanupBufferMinutes: 5,
    priceMinor: 1500, // £15.00
    currency: 'GBP',
    isActive: true,
    isPublic: true,
    displayOrder: 1,
  },
];

// Staff service assignments
const DEMO_STAFF_SERVICES = [
  // Elegant Cuts Salon assignments
  { businessIndex: 0, staffIndex: 0, serviceIndex: 0 }, // Sarah - Women's Haircut
  { businessIndex: 0, staffIndex: 0, serviceIndex: 3 }, // Sarah - Full Highlights
  { businessIndex: 0, staffIndex: 0, serviceIndex: 4 }, // Sarah - Balayage
  { businessIndex: 0, staffIndex: 1, serviceIndex: 0 }, // Emma - Women's Haircut
  { businessIndex: 0, staffIndex: 1, serviceIndex: 3 }, // Emma - Full Highlights
  { businessIndex: 0, staffIndex: 1, serviceIndex: 4 }, // Emma - Balayage
  { businessIndex: 0, staffIndex: 1, serviceIndex: 5 }, // Emma - Deep Conditioning
  { businessIndex: 0, staffIndex: 2, serviceIndex: 1 }, // Michael - Men's Haircut
  { businessIndex: 0, staffIndex: 2, serviceIndex: 2 }, // Michael - Children's Haircut
  // Gentlemen's Quarter assignments
  { businessIndex: 1, staffIndex: 0, serviceIndex: 6 }, // James - Classic Haircut
  { businessIndex: 1, staffIndex: 0, serviceIndex: 7 }, // James - Fade Haircut
  { businessIndex: 1, staffIndex: 0, serviceIndex: 8 }, // James - Skin Fade
  { businessIndex: 1, staffIndex: 1, serviceIndex: 6 }, // David - Classic Haircut
  { businessIndex: 1, staffIndex: 1, serviceIndex: 7 }, // David - Fade Haircut
  { businessIndex: 1, staffIndex: 1, serviceIndex: 9 }, // David - Hot Towel Shave
  { businessIndex: 1, staffIndex: 1, serviceIndex: 10 }, // David - Beard Trim
];

// Availability rules for each staff member
const DEMO_AVAILABILITY_RULES = [
  // Elegant Cuts Salon - Sarah Johnson
  {
    businessIndex: 0,
    staffIndex: 0,
    dayOfWeek: 1, // Monday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 0,
    dayOfWeek: 2, // Tuesday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 0,
    dayOfWeek: 3, // Wednesday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 0,
    dayOfWeek: 4, // Thursday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 0,
    dayOfWeek: 5, // Friday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  // Elegant Cuts Salon - Emma Davis
  {
    businessIndex: 0,
    staffIndex: 1,
    dayOfWeek: 1, // Monday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 1,
    dayOfWeek: 2, // Tuesday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 1,
    dayOfWeek: 3, // Wednesday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 1,
    dayOfWeek: 5, // Friday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 1,
    dayOfWeek: 6, // Saturday
    localStartTime: '09:00:00',
    localEndTime: '15:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  // Elegant Cuts Salon - Michael Brown
  {
    businessIndex: 0,
    staffIndex: 2,
    dayOfWeek: 1, // Monday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 2,
    dayOfWeek: 2, // Tuesday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 2,
    dayOfWeek: 3, // Wednesday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 2,
    dayOfWeek: 4, // Thursday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 0,
    staffIndex: 2,
    dayOfWeek: 5, // Friday
    localStartTime: '09:00:00',
    localEndTime: '17:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  // Gentlemen's Quarter - James Wilson
  {
    businessIndex: 1,
    staffIndex: 0,
    dayOfWeek: 1, // Monday
    localStartTime: '09:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 0,
    dayOfWeek: 2, // Tuesday
    localStartTime: '09:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 0,
    dayOfWeek: 3, // Wednesday
    localStartTime: '09:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 0,
    dayOfWeek: 4, // Thursday
    localStartTime: '09:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 0,
    dayOfWeek: 5, // Friday
    localStartTime: '09:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 0,
    dayOfWeek: 6, // Saturday
    localStartTime: '09:00:00',
    localEndTime: '16:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  // Gentlemen's Quarter - David Taylor
  {
    businessIndex: 1,
    staffIndex: 1,
    dayOfWeek: 1, // Monday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 1,
    dayOfWeek: 2, // Tuesday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 1,
    dayOfWeek: 3, // Wednesday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 1,
    dayOfWeek: 4, // Thursday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
  {
    businessIndex: 1,
    staffIndex: 1,
    dayOfWeek: 5, // Friday
    localStartTime: '10:00:00',
    localEndTime: '18:00:00',
    effectiveFrom: '2024-01-01',
    isActive: true,
  },
];

// Demo booking policies
const DEMO_BOOKING_POLICIES = [
  {
    businessIndex: 0,
    version: 1,
    minimumNoticeMinutes: 60,
    bookingHorizonDays: 60,
    cancellationNoticeMinutes: 1440,
    reschedulingNoticeMinutes: 1440,
    cancellationPolicyText: 'Cancellations must be made at least 24 hours in advance. Late cancellations may be subject to a fee.',
    termsText: 'By booking an appointment, you agree to our terms and conditions. Please arrive on time for your appointment.',
    isActive: true,
    effectiveFrom: '2024-01-01T00:00:00.000Z',
  },
  {
    businessIndex: 1,
    version: 1,
    minimumNoticeMinutes: 30,
    bookingHorizonDays: 60,
    cancellationNoticeMinutes: 720,
    reschedulingNoticeMinutes: 720,
    cancellationPolicyText: 'Cancellations must be made at least 12 hours in advance.',
    termsText: 'Walk-in appointments are welcome. Please call ahead for availability.',
    isActive: true,
    effectiveFrom: '2024-01-01T00:00:00.000Z',
  },
];

// Demo entitlements
const DEMO_ENTITLEMENTS = [
  // Elegant Cuts Salon
  {
    businessIndex: 0,
    featureKey: 'locations.max',
    value: '1',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Pilot business - single location',
    actor: 'system',
  },
  {
    businessIndex: 0,
    featureKey: 'staff_profiles.max',
    value: '10',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Pilot business - up to 10 staff',
    actor: 'system',
  },
  {
    businessIndex: 0,
    featureKey: 'services.max',
    value: '20',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Pilot business - up to 20 services',
    actor: 'system',
  },
  {
    businessIndex: 0,
    featureKey: 'bookings.monthly_max',
    value: '1000',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Pilot business - up to 1000 bookings/month',
    actor: 'system',
  },
  {
    businessIndex: 0,
    featureKey: 'email_notifications.enabled',
    value: 'true',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Email notifications enabled for pilot',
    actor: 'system',
  },
  // Gentlemen's Quarter
  {
    businessIndex: 1,
    featureKey: 'locations.max',
    value: '1',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Pilot business - single location',
    actor: 'system',
  },
  {
    businessIndex: 1,
    featureKey: 'staff_profiles.max',
    value: '5',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Pilot business - up to 5 staff',
    actor: 'system',
  },
  {
    businessIndex: 1,
    featureKey: 'services.max',
    value: '15',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Pilot business - up to 15 services',
    actor: 'system',
  },
  {
    businessIndex: 1,
    featureKey: 'bookings.monthly_max',
    value: '500',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Pilot business - up to 500 bookings/month',
    actor: 'system',
  },
  {
    businessIndex: 1,
    featureKey: 'email_notifications.enabled',
    value: 'true',
    source: 'pilot',
    validFrom: '2024-01-01T00:00:00.000Z',
    reason: 'Email notifications enabled for pilot',
    actor: 'system',
  },
];

async function seedDatabase() {
  const startTime = Date.now();
  logger.info('Starting database seeding...');

  try {
    // Check if seeding is enabled
    const seedEnabled = process.env.SEED_DEMO_DATA === 'true' || 
                       process.env.NODE_ENV === 'development' ||
                       process.env.NODE_ENV === 'test';
    
    if (!seedEnabled) {
      logger.info('Database seeding is disabled. Set SEED_DEMO_DATA=true to enable.');
      return { seeded: false, reason: 'Seeding disabled by configuration' };
    }

    // Get database connection
    const db = queryDb;

    logger.info('Checking if demo data already exists...');

    // Check if businesses already exist
    const existingBusinesses = await db.query.businesses.findMany({
      where: (businesses, { inArray }) => inArray(businesses.slug, DEMO_BUSINESSES.map(b => b.slug)),
    });

    if (existingBusinesses.length > 0) {
      logger.info('Demo businesses already exist. Skipping seeding.');
      return { seeded: false, reason: 'Demo data already exists' };
    }

    logger.info('Seeding demo businesses...');

    // Create businesses
    const businessIds: string[] = [];
    for (const businessData of DEMO_BUSINESSES) {
      const [business] = await db.insert(schema.businesses).values({
        id: uuidv4(),
        externalAuthOrgId: `clerk-org-${businessData.slug}`,
        ...businessData,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      businessIds.push(business.id);
      logger.info(`Created business: ${business.name} (${business.slug})`);
    }

    // Create locations
    const locationIds: string[] = [];
    for (const locationData of DEMO_LOCATIONS) {
      const businessId = businessIds[locationData.businessIndex];
      const [location] = await db.insert(schema.locations).values({
        id: uuidv4(),
        businessId,
        ...locationData,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      locationIds.push(location.id);
      logger.info(`Created location: ${location.name} for business ${businessId}`);
    }

    // Create service categories
    const categoryIds: string[] = [];
    for (const categoryData of DEMO_SERVICE_CATEGORIES) {
      const businessId = businessIds[categoryData.businessIndex];
      const [category] = await db.insert(schema.serviceCategories).values({
        id: uuidv4(),
        businessId,
        ...categoryData,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      categoryIds.push(category.id);
      logger.info(`Created service category: ${category.name} for business ${businessId}`);
    }

    // Create services
    const serviceIds: string[] = [];
    for (const serviceData of DEMO_SERVICES) {
      const businessId = businessIds[serviceData.businessIndex];
      const categoryId = categoryIds[serviceData.categoryIndex];
      const locationId = locationIds[serviceData.businessIndex]; // Each business has one location
      
      const [service] = await db.insert(schema.services).values({
        id: uuidv4(),
        businessId,
        locationId,
        categoryId,
        ...serviceData,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      serviceIds.push(service.id);
      logger.info(`Created service: ${service.name} for business ${businessId}`);
    }

    // Create staff profiles
    const staffIds: string[] = [];
    for (const staffData of DEMO_STAFF) {
      const businessId = businessIds[staffData.businessIndex];
      const locationId = locationIds[staffData.businessIndex];
      
      const [staff] = await db.insert(schema.staffProfiles).values({
        id: uuidv4(),
        businessId,
        locationId,
        ...staffData,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      staffIds.push(staff.id);
      logger.info(`Created staff profile: ${staff.displayName} for business ${businessId}`);
    }

    // Create staff-service assignments
    for (const assignment of DEMO_STAFF_SERVICES) {
      const businessId = businessIds[assignment.businessIndex];
      const staffId = staffIds[assignment.staffIndex];
      const serviceId = serviceIds[assignment.serviceIndex];
      
      await db.insert(schema.staffServices).values({
        businessId,
        staffProfileId: staffId,
        serviceId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      logger.debug(`Assigned service ${serviceId} to staff ${staffId}`);
    }

    // Create availability rules
    for (const ruleData of DEMO_AVAILABILITY_RULES) {
      const businessId = businessIds[ruleData.businessIndex];
      const staffId = staffIds[ruleData.staffIndex];
      
      await db.insert(schema.availabilityRules).values({
        id: uuidv4(),
        businessId,
        staffProfileId: staffId,
        dayOfWeek: ruleData.dayOfWeek.toString() as schema.dayOfWeekEnum.enumValues[number],
        localStartTime: ruleData.localStartTime,
        localEndTime: ruleData.localEndTime,
        effectiveFrom: new Date(ruleData.effectiveFrom),
        isActive: ruleData.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      logger.debug(`Created availability rule for staff ${staffId} on day ${ruleData.dayOfWeek}`);
    }

    // Create booking policies
    for (const policyData of DEMO_BOOKING_POLICIES) {
      const businessId = businessIds[policyData.businessIndex];
      
      await db.insert(schema.bookingPolicies).values({
        id: uuidv4(),
        businessId,
        ...policyData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      logger.info(`Created booking policy for business ${businessId}`);
    }

    // Create entitlements
    for (const entitlementData of DEMO_ENTITLEMENTS) {
      const businessId = businessIds[entitlementData.businessIndex];
      
      await db.insert(schema.entitlements).values({
        id: uuidv4(),
        businessId,
        ...entitlementData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      logger.debug(`Created entitlement ${entitlementData.featureKey} for business ${businessId}`);
    }

    logger.info('Database seeding completed successfully', {
      durationMs: Date.now() - startTime,
      businesses: businessIds.length,
      locations: locationIds.length,
      staff: staffIds.length,
      services: serviceIds.length,
      categories: categoryIds.length,
    });

    return {
      seeded: true,
      businesses: businessIds.length,
      locations: locationIds.length,
      staff: staffIds.length,
      services: serviceIds.length,
      categories: categoryIds.length,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Database seeding failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seed script completed successfully');
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

export { seedDatabase, DEMO_BUSINESSES, DEMO_LOCATIONS, DEMO_STAFF, DEMO_SERVICES, DEMO_SERVICE_CATEGORIES };
