/* eslint-disable require-await */
/* eslint-disable @typescript-eslint/require-await */
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { PrismaClient, type Prisma } from '../generated/client.js';

// Correct definition
type LoggedPrismaClient = PrismaClient<'query' | 'info' | 'warn' | 'error'>;

// Database connection states
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// Configuration interfaces
interface DatabaseConfig {
  readonly log: Prisma.LogLevel[];
  readonly errorFormat: Prisma.ErrorFormat;
}

interface ConnectionOptions {
  maxRetries?: number;
  retryDelay?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
}

// Custom error types
class DatabaseConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly retryable = true
  ) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

class DatabaseQueryError extends Error {
  constructor(
    message: string,
    public readonly query?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseQueryError';
  }
}

// Database state management
let prismaClient: LoggedPrismaClient | null = null;
let connectionState: ConnectionState = 'disconnected';

// Configuration with defaults
const defaultConfig: DatabaseConfig = {
  log: ['error', 'warn', 'info', 'query'],
  errorFormat: 'pretty',
};

const defaultOptions: Required<ConnectionOptions> = {
  maxRetries: 5,
  retryDelay: 2000,
  connectionTimeout: 10000,
  queryTimeout: 30000,
};

/**
 * Safely convert unknown error to Error instance
 */
const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
};

/**
 * Get current database configuration
 */
const getConfig = (customConfig?: Partial<DatabaseConfig>): DatabaseConfig => {
  return {
    ...defaultConfig,
    ...customConfig,
  };
};

/**
 * Create a timeout promise
 */
const createTimeoutPromise = <T>(ms: number, message: string): Promise<T> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};

/**
 * Setup event listeners for Prisma client
 */
const setupEventListeners = (client: LoggedPrismaClient, config: DatabaseConfig): void => {
  if (config.log.includes('query')) {
    client.$on('query', event => {
      console.debug(`🔍 Query: ${event.query} - Duration: ${event.duration}ms`);
    });
  }

  if (config.log.includes('info')) {
    client.$on('info', event => {
      console.info(`ℹ️ Database Info: ${event.message}`);
    });
  }

  if (config.log.includes('warn')) {
    client.$on('warn', event => {
      console.warn(`⚠️ Database Warning: ${event.message}`);
    });
  }

  if (config.log.includes('error')) {
    client.$on('error', event => {
      console.error(`❌ Database Error: ${event.message}`);
    });
  }
};

/**
 * Check if database is connected
 */
export const isDatabaseConnected = (): boolean => {
  return connectionState === 'connected';
};

export const connectDatabase = async(
  customConfig?: Partial<DatabaseConfig>
): Promise<LoggedPrismaClient> => {
  if (prismaClient) {
    return prismaClient;
  }

  const config = getConfig(customConfig);

  if (!process.env.DATABASE_URL) {
    throw new DatabaseConnectionError(
      'DATABASE_URL is not defined',
      undefined,
      false
    );
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  prismaClient = new PrismaClient({
    adapter,
    log: config.log,
    errorFormat: config.errorFormat,
  }) as LoggedPrismaClient;
  connectionState = 'connected';

  setupEventListeners(prismaClient, config);

  return prismaClient;
};

/**
 * Get database client instance
 */
export const getDatabaseClient = (): LoggedPrismaClient => {
  if (!prismaClient) {
    throw new DatabaseConnectionError(
      'Database client is not initialized. Call connectDatabase() first.',
      undefined,
      false
    );
  }
  return prismaClient;
};

/**
 * Get current connection state
 */
export const getConnectionState = (): ConnectionState => {
  return connectionState;
};

/**
 * Database Operation
 */

export const executeDbOperation = async <T>(
  operation: (client: LoggedPrismaClient) => Promise<T>,
  operationName = 'Database operation'
): Promise<T> => {
  if (!prismaClient) {
    await connectDatabase();
  }

  if (!prismaClient) {
    throw new Error("Database client failed to initialize");
  }

  try {
    return await Promise.race([
      operation(prismaClient),
      createTimeoutPromise<T>(defaultOptions.queryTimeout, `${operationName} timeout`),
    ]);
  } catch (error) {
    const dbError = toError(error);

    console.error(`❌ ${operationName} failed`, dbError);

    throw new DatabaseQueryError(
      `${operationName} failed: ${dbError.message}`,
      undefined,
      dbError
    );
  }
};


// Export types and error classes
export { DatabaseConnectionError, DatabaseQueryError };
export type { ConnectionOptions, ConnectionState, DatabaseConfig, LoggedPrismaClient };

