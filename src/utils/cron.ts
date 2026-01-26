import { executeDbOperation } from '../config/database.js';
import cron from 'node-cron';

// Every minute
cron.schedule(
  '* * * * *',
  async () => {
    const now = new Date();
    await executeDbOperation(async prisma => {
      return await prisma.course.updateMany({
        where: {
          discountEndDate: { lte: now },
          deletedAt: null,
        },
        data: {
          isDiscountActive: false,
          discountEndDate: null,
          discountPercent: null,
          discountPrice: null,
        },
      });
    }, 'Updating Course Discount End function');
  },
  {
    timezone: 'Asia/Dhaka',
  }
);

// Every hour
cron.schedule('0 * * * *', async () => {
  try {
    const deletedToken = await executeDbOperation(async prisma => {
      return await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
    });
    console.log(`Deleted ${deletedToken.count} expired refresh tokens.`);
  } catch (_err) {
    throw new Error('Error deleting expired refresh tokens with corn job.');
  }
});

// Every 6 hours
cron.schedule('0 */6 * * *', () => {
  '';
});

// Daily at 3 AM
cron.schedule('0 3 * * *', () => {
  '';
});

// Every Sunday at 2 AM
cron.schedule('0 2 * * 0', () => {
  '';
});
