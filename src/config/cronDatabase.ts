import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client.js';

let prisma: PrismaClient | null = null;

export const connectCronDatabase = async (): Promise<PrismaClient> => {
  if (prisma) {return prisma;}

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  prisma = new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });

  await prisma.$connect();
  return prisma;
};

export const disconnectCronDatabase = async (): Promise<void> => {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
};
