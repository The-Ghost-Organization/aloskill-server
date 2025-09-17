import { PrismaClient } from '@prisma/client';

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export const connectDatabase = async (): Promise<PrismaClient> => {
  await prisma.$connect();
  return prisma;
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});
