/**
 * Validation Schemas Unit Tests
 * 
 * Tests for the Zod validation schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  isoDateTimeSchema,
  isoDateSchema,
  timezoneSchema,
  currencySchema,
  phoneE164Schema,
  emailSchema,
  businessSlugSchema,
  businessTypeSchema,
  businessStatusSchema,
  createBusinessSchema,
  addressSchema,
  createLocationSchema,
  createStaffProfileSchema,
  createServiceSchema,
  createServiceCategorySchema,
  dayOfWeekSchema,
  timeSchema,
  createAvailabilityRuleSchema,
  availabilityExceptionTypeSchema,
  createAvailabilityExceptionSchema,
  createCustomerSchema,
  createBookingSchema,
  bookingSourceSchema,
  bookingStatusSchema,
  availabilityQuerySchema,
  paginationSchema,
  validate,
} from '../../src/shared/validation/schemas';

describe('Validation Schemas', () => {
  describe('Common Schemas', () => {
    describe('uuidSchema', () => {
      it('should validate valid UUIDs', () => {
        const validUuids = [
          '550e8400-e29b-41d4-a716-446655440000',
          'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        ];
        
        validUuids.forEach(uuid => {
          const result = uuidSchema.safeParse(uuid);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid UUIDs', () => {
        const invalidUuids = [
          'not-a-uuid',
          '12345',
          '550e8400-e29b-41d4-a716-44665544000', // too short
          '550e8400-e29b-41d4-a716-4466554400000', // too long
        ];
        
        invalidUuids.forEach(uuid => {
          const result = uuidSchema.safeParse(uuid);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('isoDateTimeSchema', () => {
      it('should validate valid ISO 8601 datetimes', () => {
        const validDatetimes = [
          '2024-01-15T10:00:00.000Z',
          '2024-01-15T10:00:00+00:00',
          '2024-01-15T10:00:00-05:00',
        ];
        
        validDatetimes.forEach(dt => {
          const result = isoDateTimeSchema.safeParse(dt);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid datetimes', () => {
        const invalidDatetimes = [
          '2024-01-15',
          '10:00:00',
          'not-a-date',
          '2024-13-15T10:00:00.000Z', // invalid month
        ];
        
        invalidDatetimes.forEach(dt => {
          const result = isoDateTimeSchema.safeParse(dt);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('isoDateSchema', () => {
      it('should validate valid ISO dates', () => {
        const validDates = [
          '2024-01-15',
          '2024-12-31',
          '2000-01-01',
        ];
        
        validDates.forEach(date => {
          const result = isoDateSchema.safeParse(date);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid dates', () => {
        const invalidDates = [
          '2024-01-15T10:00:00',
          '15-01-2024',
          '2024-13-15',
          'not-a-date',
        ];
        
        invalidDates.forEach(date => {
          const result = isoDateSchema.safeParse(date);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('timezoneSchema', () => {
      it('should validate valid IANA timezones', () => {
        const validTimezones = [
          'Europe/London',
          'America/New_York',
          'UTC',
          'Asia/Tokyo',
        ];
        
        validTimezones.forEach(tz => {
          const result = timezoneSchema.safeParse(tz);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid timezones', () => {
        const invalidTimezones = [
          'GMT+0',
          'UTC+1',
          'invalid/timezone',
          '',
        ];
        
        invalidTimezones.forEach(tz => {
          const result = timezoneSchema.safeParse(tz);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('currencySchema', () => {
      it('should validate valid ISO 4217 currencies', () => {
        const validCurrencies = ['GBP', 'USD', 'EUR', 'JPY'];
        
        validCurrencies.forEach(currency => {
          const result = currencySchema.safeParse(currency);
          expect(result.success).toBe(true);
        });
      });

      it('should convert to uppercase', () => {
        const result = currencySchema.safeParse('gbp');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe('GBP');
        }
      });

      it('should reject invalid currencies', () => {
        const invalidCurrencies = ['GB', 'GBPP', 'XYZ', ''];
        
        invalidCurrencies.forEach(currency => {
          const result = currencySchema.safeParse(currency);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('phoneE164Schema', () => {
      it('should validate valid E.164 phone numbers', () => {
        const validPhones = [
          '+441234567890',
          '+12345678901',
          '+447911123456',
        ];
        
        validPhones.forEach(phone => {
          const result = phoneE164Schema.safeParse(phone);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid phone numbers', () => {
        const invalidPhones = [
          '07911123456', // missing +
          '+44 1234 567890', // spaces
          '+44-1234-567890', // hyphens
          '441234567890', // missing +
          '+',
          '',
        ];
        
        invalidPhones.forEach(phone => {
          const result = phoneE164Schema.safeParse(phone);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('emailSchema', () => {
      it('should validate valid email addresses', () => {
        const validEmails = [
          'test@example.com',
          'user.name@example.co.uk',
          'test+tag@example.com',
        ];
        
        validEmails.forEach(email => {
          const result = emailSchema.safeParse(email);
          expect(result.success).toBe(true);
        });
      });

      it('should convert to lowercase', () => {
        const result = emailSchema.safeParse('Test@Example.com');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe('test@example.com');
        }
      });

      it('should reject invalid emails', () => {
        const invalidEmails = [
          'not-an-email',
          'test@example',
          '@example.com',
          '',
        ];
        
        invalidEmails.forEach(email => {
          const result = emailSchema.safeParse(email);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('paginationSchema', () => {
      it('should validate pagination parameters', () => {
        const validPagination = {
          page: 1,
          limit: 20,
        };
        
        const result = paginationSchema.safeParse(validPagination);
        expect(result.success).toBe(true);
      });

      it('should use default values', () => {
        const result = paginationSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(1);
          expect(result.data.limit).toBe(20);
        }
      });

      it('should coerce string numbers', () => {
        const result = paginationSchema.safeParse({
          page: '2',
          limit: '10',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(2);
          expect(result.data.limit).toBe(10);
        }
      });

      it('should reject invalid values', () => {
        const invalidPagination = {
          page: -1,
          limit: 200,
        };
        
        const result = paginationSchema.safeParse(invalidPagination);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Business Schemas', () => {
    describe('businessSlugSchema', () => {
      it('should validate valid business slugs', () => {
        const validSlugs = [
          'my-salon',
          'test-business-123',
          'a',
        ];
        
        validSlugs.forEach(slug => {
          const result = businessSlugSchema.safeParse(slug);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid slugs', () => {
        const invalidSlugs = [
          'My Salon', // uppercase
          'my salon', // spaces
          'my_salon', // underscores
          'my@salon', // special chars
          'a', // too short (min 3)
          '',
        ];
        
        invalidSlugs.forEach(slug => {
          const result = businessSlugSchema.safeParse(slug);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('businessTypeSchema', () => {
      it('should validate valid business types', () => {
        const validTypes = ['salon', 'barbershop', 'nail_studio', 'beauty'];
        
        validTypes.forEach(type => {
          const result = businessTypeSchema.safeParse(type);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid business types', () => {
        const result = businessTypeSchema.safeParse('invalid');
        expect(result.success).toBe(false);
      });
    });

    describe('createBusinessSchema', () => {
      it('should validate complete business data', () => {
        const validBusiness = {
          name: 'Test Salon',
          slug: 'test-salon',
          businessType: 'salon',
          timezone: 'Europe/London',
          currency: 'GBP',
          email: 'test@example.com',
          phoneE164: '+441234567890',
        };
        
        const result = createBusinessSchema.safeParse(validBusiness);
        expect(result.success).toBe(true);
      });

      it('should use default values', () => {
        const minimalBusiness = {
          name: 'Test Salon',
          slug: 'test-salon',
          email: 'test@example.com',
          phoneE164: '+441234567890',
        };
        
        const result = createBusinessSchema.safeParse(minimalBusiness);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.businessType).toBe('salon');
          expect(result.data.timezone).toBe('Europe/London');
          expect(result.data.currency).toBe('GBP');
          expect(result.data.locale).toBe('en-GB');
        }
      });

      it('should reject invalid business data', () => {
        const invalidBusiness = {
          name: '', // too short
          slug: 'invalid slug', // spaces
          email: 'invalid', // invalid email
          phoneE164: '07911123456', // missing +
        };
        
        const result = createBusinessSchema.safeParse(invalidBusiness);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Location Schemas', () => {
    describe('addressSchema', () => {
      it('should validate complete address', () => {
        const validAddress = {
          addressLine1: '123 Main Street',
          addressLine2: 'Apt 4B',
          city: 'London',
          region: 'Greater London',
          postalCode: 'SW1A 1AA',
          countryCode: 'GB',
        };
        
        const result = addressSchema.safeParse(validAddress);
        expect(result.success).toBe(true);
      });

      it('should validate minimal address', () => {
        const minimalAddress = {
          addressLine1: '123 Main Street',
          city: 'London',
        };
        
        const result = addressSchema.safeParse(minimalAddress);
        expect(result.success).toBe(true);
      });

      it('should use default country code', () => {
        const result = addressSchema.safeParse({
          addressLine1: '123 Main Street',
          city: 'London',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.countryCode).toBe('GB');
        }
      });
    });

    describe('createLocationSchema', () => {
      it('should validate complete location', () => {
        const validLocation = {
          name: 'Main Location',
          address: {
            addressLine1: '123 Main Street',
            city: 'London',
            countryCode: 'GB',
          },
          phoneE164: '+441234567890',
          timezoneOverride: 'Europe/London',
          latitude: '51.5074',
          longitude: '-0.1278',
          isPrimary: true,
          isActive: true,
          isVirtual: false,
          publicInstructions: 'Enter through the side door',
          displayOrder: 0,
        };
        
        const result = createLocationSchema.safeParse(validLocation);
        expect(result.success).toBe(true);
      });

      it('should reject invalid location', () => {
        const invalidLocation = {
          name: '', // too short
          address: {
            addressLine1: '', // too short
            city: '', // too short
          },
        };
        
        const result = createLocationSchema.safeParse(invalidLocation);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Staff Profile Schemas', () => {
    describe('createStaffProfileSchema', () => {
      it('should validate complete staff profile', () => {
        const validProfile = {
          displayName: 'John Doe',
          bio: 'Experienced stylist',
          photoUrl: 'https://example.com/photo.jpg',
          isActive: true,
          isPublic: true,
          displayOrder: 0,
          internalNotes: 'VIP client specialist',
          color: '#FF0000',
          locationId: '550e8400-e29b-41d4-a716-446655440000',
        };
        
        const result = createStaffProfileSchema.safeParse(validProfile);
        expect(result.success).toBe(true);
      });

      it('should reject invalid staff profile', () => {
        const invalidProfile = {
          displayName: '', // too short
          color: 'red', // invalid format
        };
        
        const result = createStaffProfileSchema.safeParse(invalidProfile);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Service Schemas', () => {
    describe('createServiceSchema', () => {
      it('should validate complete service', () => {
        const validService = {
          name: 'Haircut',
          description: 'Professional haircut service',
          durationMinutes: 30,
          prepBufferMinutes: 5,
          cleanupBufferMinutes: 10,
          priceMinor: 2500, // £25.00
          currency: 'GBP',
          minimumNoticeMinutesOverride: 120,
          bookingHorizonDaysOverride: 30,
          isActive: true,
          isPublic: true,
          displayOrder: 0,
          categoryId: '550e8400-e29b-41d4-a716-446655440000',
          locationId: '550e8400-e29b-41d4-a716-446655440000',
        };
        
        const result = createServiceSchema.safeParse(validService);
        expect(result.success).toBe(true);
      });

      it('should use default values', () => {
        const minimalService = {
          name: 'Haircut',
          durationMinutes: 30,
          priceMinor: 2500,
        };
        
        const result = createServiceSchema.safeParse(minimalService);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.prepBufferMinutes).toBe(0);
          expect(result.data.cleanupBufferMinutes).toBe(0);
          expect(result.data.currency).toBe('GBP');
          expect(result.data.isActive).toBe(true);
          expect(result.data.isPublic).toBe(true);
        }
      });

      it('should reject invalid service', () => {
        const invalidService = {
          name: '', // too short
          durationMinutes: 1, // too short (min 5)
          priceMinor: -100, // negative
        };
        
        const result = createServiceSchema.safeParse(invalidService);
        expect(result.success).toBe(false);
      });
    });

    describe('createServiceCategorySchema', () => {
      it('should validate service category', () => {
        const validCategory = {
          name: 'Hair Services',
          description: 'All hair-related services',
          displayOrder: 0,
          isActive: true,
        };
        
        const result = createServiceCategorySchema.safeParse(validCategory);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Availability Schemas', () => {
    describe('dayOfWeekSchema', () => {
      it('should validate day of week values', () => {
        const validDays = [0, 1, 2, 3, 4, 5, 6];
        
        validDays.forEach(day => {
          const result = dayOfWeekSchema.safeParse(day);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid day of week values', () => {
        const invalidDays = [-1, 7, 10, '0'];
        
        invalidDays.forEach(day => {
          const result = dayOfWeekSchema.safeParse(day);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('timeSchema', () => {
      it('should validate time format', () => {
        const validTimes = ['09:00:00', '17:30:00', '23:59:59'];
        
        validTimes.forEach(time => {
          const result = timeSchema.safeParse(time);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid time format', () => {
        const invalidTimes = ['9:00:00', '09:00', '25:00:00', 'invalid'];
        
        invalidTimes.forEach(time => {
          const result = timeSchema.safeParse(time);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('createAvailabilityRuleSchema', () => {
      it('should validate availability rule', () => {
        const validRule = {
          locationId: '550e8400-e29b-41d4-a716-446655440000',
          staffProfileId: '550e8400-e29b-41d4-a716-446655440001',
          dayOfWeek: 1, // Monday
          localStartTime: '09:00:00',
          localEndTime: '17:00:00',
          effectiveFrom: '2024-01-01',
          isActive: true,
        };
        
        const result = createAvailabilityRuleSchema.safeParse(validRule);
        expect(result.success).toBe(true);
      });

      it('should reject invalid availability rule', () => {
        const invalidRule = {
          dayOfWeek: 1,
          localStartTime: '17:00:00', // start after end
          localEndTime: '09:00:00',
          effectiveFrom: 'invalid',
        };
        
        const result = createAvailabilityRuleSchema.safeParse(invalidRule);
        expect(result.success).toBe(false);
      });
    });

    describe('availabilityExceptionTypeSchema', () => {
      it('should validate exception types', () => {
        const validTypes = ['closed', 'open_override', 'break', 'leave', 'manual_block'];
        
        validTypes.forEach(type => {
          const result = availabilityExceptionTypeSchema.safeParse(type);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid exception types', () => {
        const result = availabilityExceptionTypeSchema.safeParse('invalid');
        expect(result.success).toBe(false);
      });
    });

    describe('createAvailabilityExceptionSchema', () => {
      it('should validate availability exception', () => {
        const validException = {
          locationId: '550e8400-e29b-41d4-a716-446655440000',
          staffProfileId: '550e8400-e29b-41d4-a716-446655440001',
          exceptionType: 'closed',
          startsAt: '2024-01-15T10:00:00.000Z',
          endsAt: '2024-01-15T18:00:00.000Z',
          reason: 'Bank holiday',
        };
        
        const result = createAvailabilityExceptionSchema.safeParse(validException);
        expect(result.success).toBe(true);
      });

      it('should reject invalid availability exception', () => {
        const invalidException = {
          exceptionType: 'closed',
          startsAt: '2024-01-15T18:00:00.000Z', // start after end
          endsAt: '2024-01-15T10:00:00.000Z',
        };
        
        const result = createAvailabilityExceptionSchema.safeParse(invalidException);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Customer Schemas', () => {
    describe('createCustomerSchema', () => {
      it('should validate customer data', () => {
        const validCustomer = {
          displayName: 'John Doe',
          email: 'john@example.com',
          phoneE164: '+441234567890',
          internalNotes: 'Regular client',
          marketingEmailConsent: true,
          marketingSmsConsent: false,
        };
        
        const result = createCustomerSchema.safeParse(validCustomer);
        expect(result.success).toBe(true);
      });

      it('should reject invalid customer data', () => {
        const invalidCustomer = {
          displayName: '', // too short
          email: 'invalid', // invalid email
          phoneE164: '07911123456', // missing +
        };
        
        const result = createCustomerSchema.safeParse(invalidCustomer);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Booking Schemas', () => {
    describe('bookingSourceSchema', () => {
      it('should validate booking sources', () => {
        const validSources = ['phone', 'walk_in', 'admin', 'import', 'public'];
        
        validSources.forEach(source => {
          const result = bookingSourceSchema.safeParse(source);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid booking sources', () => {
        const result = bookingSourceSchema.safeParse('invalid');
        expect(result.success).toBe(false);
      });
    });

    describe('bookingStatusSchema', () => {
      it('should validate booking statuses', () => {
        const validStatuses = [
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
        ];
        
        validStatuses.forEach(status => {
          const result = bookingStatusSchema.safeParse(status);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid booking statuses', () => {
        const result = bookingStatusSchema.safeParse('invalid');
        expect(result.success).toBe(false);
      });
    });

    describe('createBookingSchema', () => {
      it('should validate complete booking', () => {
        const validBooking = {
          locationId: '550e8400-e29b-41d4-a716-446655440000',
          serviceId: '550e8400-e29b-41d4-a716-446655440001',
          staffProfileId: '550e8400-e29b-41d4-a716-446655440002',
          requestedStart: '2024-01-15T10:00:00.000Z',
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          customerPhone: '+441234567890',
          customerNote: 'Prefer morning appointments',
          customerTimezone: 'Europe/London',
          acceptedPolicyVersion: '1.0',
          idempotencyKey: 'unique-key-123',
        };
        
        const result = createBookingSchema.safeParse(validBooking);
        expect(result.success).toBe(true);
      });

      it('should validate booking without staff profile (any_available)', () => {
        const validBooking = {
          locationId: '550e8400-e29b-41d4-a716-446655440000',
          serviceId: '550e8400-e29b-41d4-a716-446655440001',
          requestedStart: '2024-01-15T10:00:00.000Z',
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          acceptedPolicyVersion: '1.0',
          idempotencyKey: 'unique-key-123',
        };
        
        const result = createBookingSchema.safeParse(validBooking);
        expect(result.success).toBe(true);
      });

      it('should reject invalid booking', () => {
        const invalidBooking = {
          locationId: 'invalid', // invalid UUID
          serviceId: 'invalid',
          requestedStart: 'invalid', // invalid datetime
          customerName: '', // too short
          customerEmail: 'invalid', // invalid email
          acceptedPolicyVersion: '', // too short
          idempotencyKey: '', // too short
        };
        
        const result = createBookingSchema.safeParse(invalidBooking);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Availability Query Schemas', () => {
    describe('availabilityQuerySchema', () => {
      it('should validate availability query', () => {
        const validQuery = {
          locationId: '550e8400-e29b-41d4-a716-446655440000',
          serviceId: '550e8400-e29b-41d4-a716-446655440001',
          staffProfileId: '550e8400-e29b-41d4-a716-446655440002',
          startDate: '2024-01-15',
          endDate: '2024-01-22',
          customerTimezone: 'Europe/London',
        };
        
        const result = availabilityQuerySchema.safeParse(validQuery);
        expect(result.success).toBe(true);
      });

      it('should validate minimal availability query', () => {
        const minimalQuery = {
          serviceId: '550e8400-e29b-41d4-a716-446655440001',
          startDate: '2024-01-15',
        };
        
        const result = availabilityQuerySchema.safeParse(minimalQuery);
        expect(result.success).toBe(true);
      });

      it('should reject invalid availability query', () => {
        const invalidQuery = {
          serviceId: 'invalid', // invalid UUID
          startDate: 'invalid', // invalid date
          endDate: '2024-01-15', // end before start
        };
        
        const result = availabilityQuerySchema.safeParse(invalidQuery);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Validation Utility', () => {
    it('should validate data successfully', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      
      const data = { name: 'John', age: 30 };
      const result = validate(schema, data);
      
      expect(result).toEqual(data);
    });

    it('should throw error for invalid data', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      
      const data = { name: 'John', age: 'thirty' };
      
      expect(() => validate(schema, data)).toThrow();
    });
  });
});