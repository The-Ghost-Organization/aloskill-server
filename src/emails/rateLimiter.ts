/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import redisConnection from './redisConnection.js';

export class EmailRateLimiter {
  private static getKeys(user: string) {
    return {
      lastSentKey: `email:lastSent:${user}`,
      dailyCountKey: `email:dailyCount:${user}`,
    };
  }

  /**
   * Checks if user can send email
   * - 1 min cooldown
   * - 5 per day max
   */
  static async canSend(user: string): Promise<{ allowed: boolean; reason?: string }> {
    const { lastSentKey, dailyCountKey } = this.getKeys(user);

    const [lastSent, dailyCount] = await redisConnection.mget(lastSentKey, dailyCountKey);
    const now = Date.now();

    // Check cooldown (1 minute = 60_000 ms)
    if (lastSent && now - parseInt(lastSent, 10) < 60_000) {
      return { allowed: false, reason: 'Cooldown: wait 1 minute before retrying' };
    }

    // Check daily limit (max 5 per day)
    if (dailyCount && parseInt(dailyCount, 10) >= 500) {
      return { allowed: false, reason: 'Daily limit reached (2 emails per day)' };
    }

    return { allowed: true };
  }

  /**
   * Record a successful send attempt
   */
  static async recordSend(user: string) {
    const { lastSentKey, dailyCountKey } = this.getKeys(user);
    const now = Date.now();

    // Update last sent timestamp
    await redisConnection.set(lastSentKey, now.toString());

    // Increment daily counter (expire after 24h)
    const count = await redisConnection.incr(dailyCountKey);
    if (count === 1) {
      await redisConnection.expire(dailyCountKey, 24 * 60 * 60); // 24h
    }
  }
}
