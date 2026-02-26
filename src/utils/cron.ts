
import cron from 'node-cron';
import { connectCronDatabase, disconnectCronDatabase } from '../config/cronDatabase.js';

let isRunning = false;

const runCronDbOperation = async <T>(
  operation: (prisma: Awaited<ReturnType<typeof connectCronDatabase>>) => Promise<T>,
  operationName?: string
): Promise<T> => {
  const prisma = await connectCronDatabase();

  try {
    return await operation(prisma);
  } catch (error) {
    console.error(`❌ Cron DB Error (${operationName}):`, error);
    throw error;
  }
};

// Every minute
cron.schedule(
  '* * * * *',
  async () => {
    if (isRunning) {
      console.warn('⏳ Cron skipped (previous job still running)');
      return;
    }

    isRunning = true;
    try {
      const now = new Date();
      const updateCourse =await runCronDbOperation(async prisma => {
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
      console.log(`Updated ${updateCourse.count} course for discountPrice and DiscountEnd date.`);
    } catch (error) {
      console.error('❌ Cron job failed (Update course for discount manage):', error);
    } finally {
      isRunning = false;
    }
  },
  {
    timezone: 'Asia/Dhaka',
  }
);

// Every hour
cron.schedule('0 * * * *', async () => {
  try {
    const deletedToken = await runCronDbOperation(async prisma => {
      return await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
    });
    console.log(`Deleted ${deletedToken.count} expired refresh tokens.`);
  } catch (err) {
    console.error('❌ Cron job failed (delete refresh tokens):', err);
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

const shutdown = () : void => {
  console.log('🛑 Cron process shutting down...');
  disconnectCronDatabase()
    .catch(err => {
      console.error('❌ Error during cron DB shutdown:', err);
    })
    .finally(() => {
      process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', err => {
  console.error('❌ Uncaught cron error:', err);
});

process.on('unhandledRejection', err => {
  console.error('❌ Unhandled cron rejection:', err);
});
