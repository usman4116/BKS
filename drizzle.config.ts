/**
 * Drizzle ORM Configuration
 * 
 * This file configures Drizzle ORM for database migrations and schema management.
 */

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/infrastructure/db/schema.ts',
  out: './migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/booking_platform',
  },
  // Use forward-only migrations for production
  // This means we can only add new migrations, not modify existing ones
  forwardMigrations: true,
  
  // Migration file naming pattern
  migrations: {
    prefix: '',
    suffix: '.sql',
    extension: 'sql',
  },
  
  // Schema file pattern
  schema: {
    include: ['src/infrastructure/db/schema.ts'],
    exclude: ['node_modules', 'dist', '.next'],
  },
  
  // Database connection options
  connection: {
    ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
    application_name: 'booking-platform-drizzle',
  },
  
  // Studio configuration (for local development)
  studio: {
    port: 3001,
    host: 'localhost',
  },
  
  // Breakpoints for debugging
  breakpoints: {
    // Uncomment to debug specific migrations
    // '0001_initial_schema': true,
    // '0002_rls_policies': true,
  },
} satisfies Config;
