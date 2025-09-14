import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

export const connectDatabase = async (): Promise<
  PrismaClient<
    {
      log: ('info' | 'query' | 'warn' | 'error')[];
    },
    'info' | 'query' | 'warn' | 'error'
  >
> => {
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
