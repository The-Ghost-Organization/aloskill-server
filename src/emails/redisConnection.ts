// import { Redis } from 'ioredis';
// import { config } from '../config/env.js';

// const redisConnection = new Redis({
//   host: config.REDIS_HOST,
//   port: Number(config.REDIS_PORT),
//   password: config.REDIS_PASSWORD,
//   // tls: {}, // ✅ required for Redis Cloud SSL - commented out for local Redis
//   maxRetriesPerRequest: null,
//   enableReadyCheck: false,
// });
// redisConnection.on('connect', () => {
//   console.log('✅ Connected to Redis Cloud');
// });

// redisConnection.on('error', err => {
//   console.error('❌ Redis connection error:', err);
// });

// export default redisConnection;

import { Redis } from 'ioredis';
import { config } from '../config/env.js';

const isProduction = process.env.NODE_ENV === 'production' || config.REDIS_HOST.includes('redis.cloud');

const redisConnection = new Redis({
  host: config.REDIS_HOST,
  port: Number(config.REDIS_PORT),
  password: config.REDIS_PASSWORD,

  // ✅ Automatically apply TLS configuration for secure cloud clusters
  tls: isProduction ? {} : undefined,

  // ✅ Critical for background workers like BullMQ
  maxRetriesPerRequest: null,

  // ✅ Changed to true for safe operational commands processing on startup
  enableReadyCheck: true,

  // ✅ Production-grade backoff reconnection strategy
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    console.warn(`⚠️ Redis connection lost. Reconnecting attempt #${times} in ${delay}ms...`);
    return delay; // Tries reconnecting with a backoff up to 2 seconds max per retry
  },

  // Optional: Prevent massive backlogs if Redis goes down for a long period
  maxLoadingRetryTime: 10000,
});

// 2. Comprehensive Event Monitoring
redisConnection.on('connect', () => {
  console.log('✅ Connected to Redis (Socket initialized)');
});

redisConnection.on('ready', () => {
  console.log('🚀 Redis Cloud is ready to accept commands');
});

redisConnection.on('error', (err) => {
  // 💡 Crucial: Registering an error listener prevents your entire Express/Node app from crashing
  // during a temporary network disconnect.
  console.error('❌ Redis operational connection error:', err.message);
});

redisConnection.on('close', () => {
  console.warn('📡 Redis connection socket closed');
});

export default redisConnection;
