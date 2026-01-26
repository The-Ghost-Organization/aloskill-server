import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { PrismaClient, type Prisma } from '../generated/client.js';

// Type-safe Prisma client based on log configuration
// type LoggedPrismaClient = PrismaClient<{
//   log: ('query' | 'info' | 'warn' | 'error')[];
// }>;

// Correct definition
type LoggedPrismaClient = PrismaClient<'query' | 'info' | 'warn' | 'error'>;

// Database connection states
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// Configuration interfaces
interface DatabaseConfig {
  readonly log: Prisma.LogLevel[];
  readonly errorFormat: Prisma.ErrorFormat;
  // readonly datasources: {
  //   db: {
  //     url: string;
  //   };
  // };
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
let reconnectTimer: NodeJS.Timeout | null = null;
let healthCheckTimer: NodeJS.Timeout | null = null;

// Configuration with defaults
const defaultConfig: DatabaseConfig = {
  log: ['error', 'warn', 'info', 'query'],
  errorFormat: 'pretty',
  // datasources: {
  //   db: {
  //     url: process.env.DATABASE_URL ?? '',
  //   },
  // },
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
 * Safely get error message from unknown error
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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
 * Get connection options
 */
const getOptions = (customOptions?: ConnectionOptions): Required<ConnectionOptions> => {
  return {
    ...defaultOptions,
    ...customOptions,
  };
};

/**
 * Utility function for delays
 */
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
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
 * Check if error is connection-related
 */
const isConnectionError = (error: Error): boolean => {
  const connectionErrors = [
    'connection',
    'connect',
    'timeout',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
  ];

  return connectionErrors.some(keyword =>
    error.message.toLowerCase().includes(keyword.toLowerCase())
  );
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
 * Create a new Prisma client instance
 */
const createPrismaClient = async (config: DatabaseConfig): Promise<LoggedPrismaClient> => {
  // Close existing client if any
  if (prismaClient) {
    await prismaClient.$disconnect().catch(() => {
      // Ignore disconnect errors during reconnection
    });
  }
  if (!process.env.DATABASE_URL) {
    throw new DatabaseConnectionError('DATABASE_URL is not defined', undefined, false);
  }
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  // Create new client
  const client = new PrismaClient({
    adapter,
    log: config.log,
    errorFormat: config.errorFormat,
    // datasources: config.datasources,
  }) as LoggedPrismaClient;

  // Setup event listeners
  setupEventListeners(client, config);

  return client;
};

/**
 * Test database connection
 */
const testConnection = async (
  client: LoggedPrismaClient,
  options: Required<ConnectionOptions>
): Promise<void> => {
  // Connect to database
  await Promise.race([
    client.$connect(),
    createTimeoutPromise(options.connectionTimeout, 'Connection timeout'),
  ]);

  // Verify connection with a simple query
  await Promise.race([
    client.$queryRaw`SELECT 1`,
    createTimeoutPromise(5000, 'Connection test timeout'),
  ]);
};

/**
 * Wait for existing connection attempt to complete
 */
const waitForConnection = async (): Promise<LoggedPrismaClient> => {
  const maxWait = 30000; // 30 seconds
  const checkInterval = 100; // 100ms
  let waited = 0;

  while (connectionState === 'connecting' && waited < maxWait) {
    await delay(checkInterval);
    waited += checkInterval;
  }

  if (connectionState === 'connected' && prismaClient) {
    return prismaClient;
  }

  throw new DatabaseConnectionError('Connection attempt timed out or failed');
};

/**
 * Clear reconnection timer
 */
const clearReconnectTimer = (): void => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

/**
 * Schedule reconnection attempt
 */
const scheduleReconnect = (options: Required<ConnectionOptions>): void => {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    handleConnectionLoss(options);
  }, options.retryDelay * 2);
};

/**
 * Handle connection loss and initiate reconnection
 */
const handleConnectionLoss = (options: Required<ConnectionOptions>): void => {
  if (connectionState === 'reconnecting') {
    return; // Already attempting to reconnect
  }

  console.warn('🔄 Database connection lost, attempting to reconnect...');
  connectionState = 'reconnecting';

  reconnectTimer = setTimeout(() => {
    connectDatabase()
      .then(() => {
        console.info('✅ Database reconnection successful');
      })
      .catch(error => {
        console.error('❌ Reconnection failed:', getErrorMessage(error));
        scheduleReconnect(options);
      });
  }, options.retryDelay);
};

/**
 * Start periodic health checks
 */
const startHealthCheck = (): void => {
  stopHealthCheck();

  healthCheckTimer = setInterval(() => {
    checkDatabaseHealth()
      .then(isHealthy => {
        if (!isHealthy) {
          console.warn('⚠️ Database health check failed');
        }
      })
      .catch(error => {
        console.error('❌ Health check error:', getErrorMessage(error));
      });
  }, 30000); // Check every 30 seconds
};

/**
 * Stop health check timer
 */
const stopHealthCheck = (): void => {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
};

/**
 * Connect to database with retry logic
 */
export const connectDatabase = async (
  customConfig?: Partial<DatabaseConfig>,
  customOptions?: ConnectionOptions
): Promise<LoggedPrismaClient> => {
  const config = getConfig(customConfig);
  const options = getOptions(customOptions);

  // Return existing connection if already connected
  if (connectionState === 'connected' && prismaClient) {
    return prismaClient;
  }

  // Wait for existing connection attempt
  if (connectionState === 'connecting') {
    return waitForConnection();
  }

  connectionState = 'connecting';
  let lastError: Error | undefined;

  // Retry connection attempts
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      console.log(`🗄️ Connecting to database (attempt ${attempt}/${options.maxRetries})...`);

      // Create and test connection
      const client = await createPrismaClient(config);
      await testConnection(client, options);

      // Connection successful
      prismaClient = client;
      connectionState = 'connected';

      // Start health monitoring
      startHealthCheck();

      console.info(`✅ Database connected successfully (attempt ${attempt}/${options.maxRetries})`);
      return prismaClient;
    } catch (error) {
      lastError = toError(error);
      connectionState = 'error';

      console.warn(
        `❌ Database connection failed (attempt ${attempt}/${options.maxRetries}):`,
        lastError.message
      );

      // Wait before retry (except on last attempt)
      if (attempt < options.maxRetries) {
        await delay(options.retryDelay * attempt);
      }
    }
  }

  // All attempts failed
  connectionState = 'disconnected';
  throw new DatabaseConnectionError(
    `Failed to connect to database after ${options.maxRetries} attempts`,
    lastError
  );
};

/**
 * Disconnect from database
 */
export const disconnectDatabase = async (): Promise<void> => {
  console.log('🛑 Disconnecting from database...');

  // Stop health monitoring
  stopHealthCheck();
  clearReconnectTimer();

  if (prismaClient) {
    try {
      await Promise.race([
        prismaClient.$disconnect(),
        createTimeoutPromise(5000, 'Disconnect timeout'),
      ]);

      console.info('📤 Database disconnected successfully');
    } catch (error) {
      console.error('❌ Error during database disconnection:', getErrorMessage(error));
    } finally {
      prismaClient = null;
      connectionState = 'disconnected';
    }
  }
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
 * Check if database is connected
 */
export const isDatabaseConnected = (): boolean => {
  return connectionState === 'connected';
};

/**
 * Get current connection state
 */
export const getConnectionState = (): ConnectionState => {
  return connectionState;
};

/**
 * Check database health
 */
export const checkDatabaseHealth = async (): Promise<boolean> => {
  if (!prismaClient || connectionState !== 'connected') {
    return false;
  }

  try {
    await Promise.race([
      prismaClient.$queryRaw`SELECT 1`,
      createTimeoutPromise(5000, 'Health check timeout'),
    ]);
    return true;
  } catch (error) {
    console.error('❌ Database health check failed:', getErrorMessage(error));

    // Handle connection loss
    const options = getOptions();
    handleConnectionLoss(options);

    return false;
  }
};

/**
 * Execute database operation with proper error handling
 */
export const executeDbOperation = async <T>(
  operation: (client: LoggedPrismaClient) => Promise<T>,
  operationName = 'Database operation'
): Promise<T> => {
  // Ensure we're connected
  if (!isDatabaseConnected()) {
    await connectDatabase();
  }

  const options = getOptions();

  try {
    return await Promise.race([
      operation(getDatabaseClient()),
      createTimeoutPromise<T>(options.queryTimeout, `${operationName} timeout`),
    ]);
  } catch (error) {
    const dbError = toError(error);

    // Handle connection-related errors
    if (isConnectionError(dbError)) {
      handleConnectionLoss(options);
    }

    throw new DatabaseQueryError(`${operationName} failed: ${dbError.message}`, undefined, dbError);
  }
};

// Export types and error classes
export { DatabaseConnectionError, DatabaseQueryError };
export type { ConnectionOptions, ConnectionState, DatabaseConfig, LoggedPrismaClient };
