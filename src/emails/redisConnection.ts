import { Redis, type RedisOptions } from 'ioredis';

import { config } from '../config/env.js';

type RedisRole = 'producer' | 'worker';

const useTls = process.env.REDIS_TLS === 'true';

function connectionOptions(role: RedisRole): RedisOptions {
  return {
    host: config.REDIS_HOST,
    port: Number(config.REDIS_PORT),
    password: config.REDIS_PASSWORD,
    tls: useTls ? {} : undefined,
    enableReadyCheck: true,
    maxRetriesPerRequest: role === 'worker' ? null : 1,
    connectTimeout: 10_000,
    retryStrategy(times) {
      return Math.min(times * 100, 3_000);
    },
  };
}

export function createRedisConnection(role: RedisRole): Redis {
  const connection = new Redis(connectionOptions(role));

  connection.on('error', error => {
    console.error(`[redis:${role}] connection error`, { message: error.message });
  });

  return connection;
}

const redisConnection = createRedisConnection('producer');

export default redisConnection;
