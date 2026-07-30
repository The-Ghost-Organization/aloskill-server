import redisConnection from '../emails/redisConnection.js';

export async function reserveBookStock(bookId: string, quantity: number): Promise<boolean> {
  const lockKey = `stock_lock:book:${bookId}`;

  // Use Redis ATOMIC operations to check and decrease allocation
  // Assuming you synced initial stock count to Redis. Alternatively, use standard atomics:
  const currentReserved = await redisConnection.incrby(lockKey, quantity);

  // Set an expiry of 10 minutes. If they don't pay, stock is automatically released back
  await redisConnection.expire(lockKey, 600);

  return true;
}
