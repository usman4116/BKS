import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { logger } from '../observability/logger';

// Database connection configuration
type DatabaseConfig = {
  connectionString: string;
  maxPoolSize?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
};

// Connection pool for application queries
let queryClient: postgres.Sql | null = null;

// Direct connection for migrations (no pooling)
let directClient: postgres.Sql | null = null;

/**
 * Get the database query client
 * This client is used for application queries with connection pooling
 */
export function getQueryClient(): postgres.Sql {
  if (!queryClient) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    const config: postgres.Options = {
      connectionString,
      // Connection pool settings
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30'),
      connect_timeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10'),
      // SSL settings for production
      ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
      // Application name for monitoring
      application_name: `booking-platform-${process.env.NODE_ENV || 'development'}`,
    };
    
    queryClient = postgres(config);
    
    // Log connection events
    queryClient.on('connect', () => {
      logger.info('Database connection established');
    });
    
    queryClient.on('error', (error) => {
      logger.error('Database connection error', { error: error.message });
    });
    
    logger.info('Database query client initialized');
  }
  
  return queryClient;
}

/**
 * Get the direct database client
 * This client is used for migrations and other operations that shouldn't use pooling
 */
export function getDirectClient(): postgres.Sql {
  if (!directClient) {
    const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_DIRECT_URL or DATABASE_URL environment variable is not set');
    }
    
    const config: postgres.Options = {
      connectionString,
      // No pooling for direct connections
      max: 1,
      ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
      application_name: `booking-platform-direct-${process.env.NODE_ENV || 'development'}`,
    };
    
    directClient = postgres(config);
    logger.info('Database direct client initialized');
  }
  
  return directClient;
}

/**
 * Get the Drizzle ORM database instance
 * This is the main database interface used throughout the application
 */
export const db = drizzle(getQueryClient(), { schema });

/**
 * Get the Drizzle ORM database instance for direct connections
 * Used for migrations and schema operations
 */
export const directDb = drizzle(getDirectClient(), { schema });

/**
 * Close all database connections
 * Used for graceful shutdown
 */
export async function closeConnections(): Promise<void> {
  if (queryClient) {
    await queryClient.end();
    queryClient = null;
    logger.info('Database query client closed');
  }
  
  if (directClient) {
    await directClient.end();
    directClient = null;
    logger.info('Database direct client closed');
  }
}

/**
 * Test database connectivity
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getQueryClient();
    await client`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database connection test failed', { error });
    return false;
  }
}

/**
 * Execute a transaction
 * Provides a clean interface for transaction management
 */
export async function executeTransaction<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  const client = getQueryClient();
  
  return client.transaction(async (tx) => {
    const transactionDb = drizzle(tx, { schema });
    return callback(transactionDb);
  });
}

// Re-export schema for convenience
export * from './schema';

export default db;