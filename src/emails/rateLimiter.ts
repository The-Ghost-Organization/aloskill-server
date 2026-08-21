import { createHash } from 'node:crypto';

import redisConnection from './redisConnection.js';

const COOLDOWN_SECONDS = Number(process.env.EMAIL_COOLDOWN_SECONDS ?? 60);
const DAILY_LIMIT = Number(process.env.EMAIL_DAILY_LIMIT ?? 5);
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

const CONSUME_SCRIPT = `
  local lastSentKey = KEYS[1]
  local dailyCountKey = KEYS[2]
  local cooldownSeconds = tonumber(ARGV[1])
  local dailyLimit = tonumber(ARGV[2])
  local dailyWindowSeconds = tonumber(ARGV[3])

  if redis.call('EXISTS', lastSentKey) == 1 then
    return {0, 'cooldown', redis.call('TTL', lastSentKey)}
  end

  local dailyCount = tonumber(redis.call('GET', dailyCountKey) or '0')
  if dailyCount >= dailyLimit then
    return {0, 'daily_limit', redis.call('TTL', dailyCountKey)}
  end

  redis.call('SET', lastSentKey, '1', 'EX', cooldownSeconds)
  local newCount = redis.call('INCR', dailyCountKey)
  if newCount == 1 then
    redis.call('EXPIRE', dailyCountKey, dailyWindowSeconds)
  end

  return {1, 'allowed', newCount}
`;

function recipientKey(recipient: string): string {
  return createHash('sha256').update(recipient.trim().toLowerCase()).digest('hex');
}

export class EmailRateLimiter {
  static async consume(recipient: string): Promise<{ allowed: boolean; reason?: string }> {
    if (!Number.isInteger(COOLDOWN_SECONDS) || COOLDOWN_SECONDS < 1) {
      throw new Error('EMAIL_COOLDOWN_SECONDS must be a positive integer');
    }

    if (!Number.isInteger(DAILY_LIMIT) || DAILY_LIMIT < 1) {
      throw new Error('EMAIL_DAILY_LIMIT must be a positive integer');
    }

    const hash = recipientKey(recipient);
    const result = (await redisConnection.eval(
      CONSUME_SCRIPT,
      2,
      `email:last-sent:${hash}`,
      `email:daily-count:${hash}`,
      COOLDOWN_SECONDS,
      DAILY_LIMIT,
      DAILY_WINDOW_SECONDS
    )) as [number, string, number];

    if (result[0] === 1) {
      return { allowed: true };
    }

    const waitSeconds = Math.max(Number(result[2]) || 0, 0);
    const reason =
      result[1] === 'cooldown'
        ? `Please wait ${waitSeconds} seconds before requesting another email`
        : `Daily email limit reached; try again in ${waitSeconds} seconds`;

    return { allowed: false, reason };
  }
}
