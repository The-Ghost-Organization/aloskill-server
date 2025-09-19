/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-condition*/

import 'dotenv/config';
import type { Express } from 'express';
import { type Server } from 'http';
import app from './app.js';
import {
  checkDatabaseHealth,
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
} from './config/database.js';
import { config } from './config/env.js';

// Server state management
let server: Server | null = null;
let isShuttingDown = false;
let healthCheckTimer: NodeJS.Timeout | null = null;

// Configuration constants
const SHUTDOWN_TIMEOUT = 30000; // 30 seconds
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute
const SERVER_TIMEOUT = 30000; // 30 seconds

/**
 * Validate required environment variables
 */
const validateEnvironment = (): void => {
  console.log('  🔍 Checking environment variables...');

  const requiredEnvVars = ['PORT', 'NODE_ENV', 'DATABASE_URL'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error(`  ❌ Missing: ${missingVars.join(', ')}`);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate PORT is a valid number
  const port = parseInt(config.PORT);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`  ❌ Invalid PORT: ${config.PORT}`);
    throw new Error(`Invalid PORT value: ${config.PORT}`);
  }

  console.log(`  ✅ PORT: ${config.PORT}`);
  console.log(`  ✅ NODE_ENV: ${config.NODE_ENV}`);
  console.log(`  ✅ DATABASE_URL: ${process.env.DATABASE_URL ? 'Set' : 'Missing'}`);
};

/**
 * Initialize database connection with health check
 */
const initializeDatabase = async (): Promise<void> => {
  console.log('  🔌 Connecting to database...');

  try {
    await connectDatabase();
    console.log('  ✅ Database connection established');

    // Verify database health
    console.log('  🏥 Checking database health...');
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      throw new Error('Database health check failed after connection');
    }
    console.log('  ✅ Database health check passed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Database error: ${errorMessage}`);
    throw new Error(`Database initialization failed: ${errorMessage}`);
  }
};

/**
 * Start the HTTP server
 */
const startHttpServer = async (): Promise<void> => {
  console.log('  🌐 Creating HTTP server...');

  return new Promise((resolve, reject) => {
    try {
      const expressApp = app as unknown as Express;

      server = expressApp.listen(config.PORT, () => {
        console.log(`  ✅ HTTP Server listening on port ${config.PORT}`);
        resolve();
      });

      // Handle server startup errors
      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`  ❌ Port ${config.PORT} is already in use`);
          reject(new Error(`Port ${config.PORT} is already in use`));
        } else if (error.code === 'EACCES') {
          console.error(`  ❌ Permission denied for port ${config.PORT}`);
          reject(new Error(`Permission denied for port ${config.PORT}`));
        } else {
          console.error(`  ❌ Server error: ${error.message}`);
          reject(new Error(`HTTP server startup failed: ${error.message}`));
        }
      });

      // Configure server settings
      if (server) {
        server.timeout = SERVER_TIMEOUT;
        console.log(`  ⏱️ Server timeout set to ${SERVER_TIMEOUT}ms`);

        // Handle runtime server errors
        server.on('error', error => {
          console.error('🚨 Server runtime error:', error);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed to create server: ${errorMessage}`);
      reject(new Error(`Failed to create HTTP server: ${errorMessage}`));
    }
  });
};

/**
 * Perform system health check
 */
const performHealthCheck = async (): Promise<boolean> => {
  try {
    // Check database health
    const dbHealthy = isDatabaseConnected() && (await checkDatabaseHealth());
    if (!dbHealthy) {
      console.warn('⚠️ Database health check failed');
      return false;
    }

    // Check if HTTP server is listening
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (!server || !server.listening) {
      console.warn('⚠️ HTTP server is not listening');
      return false;
    }

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryThresholdMB = 512; // 512MB threshold
    const currentMemoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    if (currentMemoryMB > memoryThresholdMB) {
      console.warn(`⚠️ High memory usage detected: ${currentMemoryMB}MB`);
    }

    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    return false;
  }
};

/**
 * Start periodic health monitoring
 */
const startHealthMonitoring = (): void => {
  console.log('🏥 Starting health monitoring...');

  healthCheckTimer = setInterval(() => {
    performHealthCheck()
      .then(isHealthy => {
        if (!isHealthy) {
          console.warn('⚠️ System health check failed');
        }
      })
      .catch(error => {
        console.error('❌ Health check error:', error);
      });
  }, HEALTH_CHECK_INTERVAL);

  console.log('✅ Health monitoring started');
};

/**
 * Stop health monitoring
 */
const stopHealthMonitoring = (): void => {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
    console.log('🛑 Health monitoring stopped');
  }
};

/**
 * Close HTTP server
 */
const closeHttpServer = async (): Promise<void> => {
  return new Promise<void>(resolve => {
    if (server) {
      server.close(() => {
        console.log('🔒 HTTP server closed');
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
};

/**
 * Close database connections
 */
const closeDatabaseConnections = async (): Promise<void> => {
  if (isDatabaseConnected()) {
    await disconnectDatabase();
    console.log('🗄️ Database connections closed');
  }
};

/**
 * Perform graceful shutdown
 */
const performGracefulShutdown = async (): Promise<void> => {
  console.log('🛑 Starting graceful shutdown...');

  const shutdownSteps = [
    { name: 'Stop health monitoring', action: stopHealthMonitoring },
    { name: 'Close HTTP server', action: closeHttpServer },
    { name: 'Close database connections', action: closeDatabaseConnections },
  ];

  for (const step of shutdownSteps) {
    try {
      console.log(`🔄 ${step.name}...`);
      step.action();
      console.log(`✅ ${step.name} completed`);
    } catch (error) {
      console.error(`❌ Failed to ${step.name}:`, error);
      // Continue with other shutdown steps
    }
  }
};

/**
 * Graceful shutdown with timeout
 */
const gracefulShutdown = async (): Promise<void> => {
  if (isShuttingDown) {
    console.log('⏳ Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log('📥 Received shutdown signal...');

  const shutdownPromise = performGracefulShutdown();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT}ms`));
    }, SHUTDOWN_TIMEOUT);
  });

  try {
    await Promise.race([shutdownPromise, timeoutPromise]);
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Shutdown error:', error);
    console.log('🚨 Forcing process exit...');
    process.exit(1);
  }
};

/**
 * Setup process signal handlers
 */
const setupSignalHandlers = (): void => {
  console.log('🛡️ Setting up signal handlers...');

  // Handle termination signals
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

  signals.forEach(signal => {
    process.on(signal, () => {
      console.log(`📥 Received ${signal} signal`);
      gracefulShutdown().catch(() => {
        process.exit(1);
      });
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', error => {
    console.error('🚨 Uncaught Exception:', error);
    gracefulShutdown().catch(() => {
      process.exit(1);
    });
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown().catch(() => {
      process.exit(1);
    });
  });

  console.log('✅ Signal handlers registered');
};

/**
 * Main server startup function
 */
const startServer = async (): Promise<void> => {
  try {
    console.log('🚀 Starting server initialization...');

    // Step 1: Validate environment
    console.log('🔍 Step 1: Validating environment...');
    validateEnvironment();

    // Step 2: Initialize database
    console.log('🗄️ Step 2: Initializing database...');
    await initializeDatabase();

    // Step 3: Start HTTP server
    console.log('🌐 Step 3: Starting HTTP server...');
    await startHttpServer();

    // Step 4: Start health monitoring
    console.log('🏥 Step 4: Starting health monitoring...');
    startHealthMonitoring();

    // Step 5: Setup signal handlers
    console.log('🛡️ Step 5: Setting up signal handlers...');
    setupSignalHandlers();

    // Server started successfully
    console.log('');
    console.log('🎉 ================================');
    console.log('✅ SERVER STARTED SUCCESSFULLY!');
    console.log('🎉 ================================');
    console.log(`📊 Environment: ${config.NODE_ENV}`);
    console.log(`🌐 Server URL: http://localhost:${config.PORT}`);
    console.log(`🗄️ Database: ${isDatabaseConnected() ? 'Connected' : 'Disconnected'}`);
    console.log('================================');
    console.log('');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';

    console.log('');
    console.log('💥 ================================');
    console.log('❌ SERVER STARTUP FAILED!');
    console.log('💥 ================================');
    console.error(`Error: ${errorMessage}`);
    if (errorStack) {
      console.error('Stack trace:');
      console.error(errorStack);
    }
    console.log('================================');
    console.log('');

    // Cleanup on startup failure
    console.log('🧹 Cleaning up...');
    await performGracefulShutdown().catch(cleanupError => {
      console.error('❌ Cleanup error:', cleanupError);
    });

    process.exit(1);
  }
};

// Start the server if this file is run directly
// Check if this file is being run directly (ES module equivalent of require.main === module)
// const isMainModule = import.meta.url === `file://${process.argv[1]}`;
const isMainModule =
  config.NODE_ENV === 'development' && process.argv.some(arg => arg.includes('server.ts'));

if (isMainModule) {
  startServer().catch(error => {
    console.error('💥 Fatal error during server startup:', error);
    process.exit(1);
  });
}

export default startServer;
