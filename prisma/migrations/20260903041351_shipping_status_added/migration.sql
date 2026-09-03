-- CreateEnum
CREATE TYPE "Courier" AS ENUM ('STEADFAST', 'REDX', 'PAPERFLY', 'PATHAO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderItemStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "OrderItemStatus" ADD VALUE 'SHIPPED';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "courierName" "Courier",
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "trackingNumber" TEXT;
