import { Redis } from 'ioredis';
import { config } from '../config/env.js';

const redisConnection = new Redis({
  host: config.REDIS_HOST,
  port: Number(config.REDIS_PORT),
  password: config.REDIS_PASSWORD,
  // tls: {}, // ✅ required for Redis Cloud SSL - commented out for local Redis
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
redisConnection.on('connect', () => {
  console.log('✅ Connected to Redis Cloud');
});

redisConnection.on('error', err => {
  console.error('❌ Redis connection error:', err);
});

export default redisConnection;
