import { createLogger, format, transports, Logger } from 'winston';
import { v4 as uuidv4 } from 'uuid';

// Log levels
type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'silly';

// Log entry interface
interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  correlationId?: string;
  businessId?: string;
  userId?: string;
  error?: Error | string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// Context interface for structured logging
interface LogContext {
  requestId?: string;
  correlationId?: string;
  businessId?: string;
  userId?: string;
  [key: string]: unknown;
}

// Create a logger instance
let loggerInstance: Logger | null = null;

/**
 * Initialize the logger with configuration
 */
export function initializeLogger(): Logger {
  if (loggerInstance) {
    return loggerInstance;
  }

  const env = process.env.NODE_ENV || 'development';
  const logLevel = (process.env.LOG_LEVEL as LogLevel) || (env === 'production' ? 'info' : 'debug');

  // Format for console output
  const consoleFormat = format.combine(
    format.colorize(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.printf(({ level, message, timestamp, stack, ...meta }: LogEntry) => {
      const contextParts: string[] = [];
      
      if (meta.requestId) contextParts.push(`req=${meta.requestId}`);
      if (meta.correlationId) contextParts.push(`corr=${meta.correlationId}`);
      if (meta.businessId) contextParts.push(`biz=${meta.businessId}`);
      if (meta.userId) contextParts.push(`user=${meta.userId}`);
      
      const context = contextParts.length > 0 ? `[${contextParts.join(' ')}]` : '';
      const error = meta.error ? `\n${stack || (meta.error as Error).stack || meta.error}` : '';
      
      return `${timestamp} ${level} ${context} ${message}${error}`;
    })
  );

  // Format for JSON output (for production or structured logging)
  const jsonFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  );

  // Create the logger
  loggerInstance = createLogger({
    level: logLevel,
    exitOnError: false,
    format: env === 'production' ? jsonFormat : consoleFormat,
    transports: [
      // Console transport
      new transports.Console({
        level: logLevel,
        format: env === 'production' ? jsonFormat : consoleFormat,
      }),
      // File transport for errors (in production)
      ...(env === 'production' ? [
        new transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: jsonFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        new transports.File({
          filename: 'logs/combined.log',
          level: logLevel,
          format: jsonFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ] : []),
    ],
    // Don't log to console in test environment
    silent: env === 'test',
  });

  // Handle uncaught exceptions
  loggerInstance.exceptions.handle(
    new transports.File({ filename: 'logs/exceptions.log', maxsize: 10 * 1024 * 1024, maxFiles: 5 })
  );

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    loggerInstance.error('Unhandled Rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise,
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    loggerInstance.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });
    // Re-throw to allow process to crash
    process.exit(1);
  });

  return loggerInstance;
}

/**
 * Get the logger instance
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = initializeLogger();
  }
  return loggerInstance;
}

// Initialize logger on import
export const logger = getLogger();

/**
 * Create a child logger with context
 */
export function createChildLogger(context: LogContext) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      logger.debug(message, { ...context, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      logger.info(message, { ...context, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      logger.warn(message, { ...context, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      logger.error(message, { ...context, ...meta }),
    // Convenience method for errors
    errorWithStack: (error: Error, message?: string, meta?: Record<string, unknown>) =>
      logger.error(message || error.message, { 
        ...context, 
        error: error.message,
        stack: error.stack,
        ...meta 
      }),
  };
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return uuidv4();
}

/**
 * Generate a unique correlation ID
 */
export function generateCorrelationId(): string {
  return uuidv4();
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Mask potential sensitive strings
    if (/password/i.test(data)) return '***MASKED***';
    if (/token/i.test(data)) return '***MASKED***';
    if (/secret/i.test(data)) return '***MASKED***';
    if (/key/i.test(data)) return '***MASKED***';
    if (/credit.*card/i.test(data)) return '***MASKED***';
    if (/ssn/i.test(data)) return '***MASKED***';
    return data;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('credit') ||
        lowerKey.includes('ssn') ||
        lowerKey.includes('authorization')
      ) {
        result[key] = '***MASKED***';
      } else {
        result[key] = maskSensitiveData(value);
      }
    }
    return result;
  }

  if (Array.isArray(data)) {
    return data.map(maskSensitiveData);
  }

  return data;
}

/**
 * Log a request start
 */
export function logRequestStart(
  method: string,
  path: string,
  context: LogContext = {}
) {
  const requestId = context.requestId || generateRequestId();
  const correlationId = context.correlationId || generateCorrelationId();
  
  logger.info('Request started', {
    ...context,
    requestId,
    correlationId,
    method,
    path,
    timestamp: new Date().toISOString(),
  });
  
  return { requestId, correlationId };
}

/**
 * Log a request end
 */
export function logRequestEnd(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  context: LogContext = {}
) {
  logger.info('Request completed', {
    ...context,
    method,
    path,
    statusCode,
    durationMs: duration,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log an error
 */
export function logError(
  error: Error | string,
  context: LogContext & { message?: string } = {}
) {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'string' ? undefined : error.stack;
  
  logger.error(context.message || 'Error occurred', {
    ...context,
    error: errorMessage,
    stack,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log a database query (for debugging)
 */
export function logDatabaseQuery(
  query: string,
  params: unknown[] = [],
  duration: number,
  context: LogContext = {}
) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  
  logger.debug('Database query', {
    ...context,
    query: maskSensitiveData(query),
    params: maskSensitiveData(params),
    durationMs: duration,
    timestamp: new Date().toISOString(),
  });
}

// Re-export types
export type { LogLevel, LogEntry, LogContext };