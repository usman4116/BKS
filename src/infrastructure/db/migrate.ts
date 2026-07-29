/**
 * Database Migration Script
 * 
 * This script applies database migrations using Drizzle ORM.
 * Run with: npm run db:migrate
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { logger } from '../observability/logger';

async function runMigrations() {
  const startTime = Date.now();
  logger.info('Starting database migrations...');

  try {
    // Get database connection string
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Create migration client (no pooling for migrations)
    const migrationClient = postgres(connectionString, {
      max: 1,
      ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
    });

    // Create Drizzle instance for migrations
    const db = drizzle(migrationClient);

    logger.info('Applying database migrations...');

    // Run migrations
    const results = await migrate(db, {
      migrationsFolder: './migrations',
      migrationsTable: 'drizzle_migrations',
      migrationsSchema: 'public',
    });

    logger.info(`Migrations completed successfully`, {
      durationMs: Date.now() - startTime,
      appliedMigrations: results.length,
    });

    if (results.length > 0) {
      logger.info('Applied migrations:', {
        migrations: results.map(r => r.filename),
      });
    } else {
      logger.info('No new migrations to apply');
    }

    // Close connection
    await migrationClient.end();

    return results;
  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migration script completed successfully');
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

export { runMigrations };
