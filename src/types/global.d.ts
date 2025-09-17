import { PrismaClient } from '@prisma/client';

declare global {
  // This merges into the NodeJS globalThis type
  // so `global.prisma` is properly typed
  var prisma: PrismaClient | undefined;
}

export {};
