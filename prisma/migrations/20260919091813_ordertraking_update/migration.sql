/*
  Warnings:

  - A unique constraint covering the columns `[courierConsignmentId]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courierTrackingCode]` on the table `orders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "DeliveryArea" ADD VALUE 'DHAKA_SUBURBAN';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "courierConsignmentId" TEXT,
ADD COLUMN     "courierLastError" TEXT,
ADD COLUMN     "courierName" "Courier",
ADD COLUMN     "courierStatus" TEXT,
ADD COLUMN     "courierStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "courierTrackingCode" TEXT,
ADD COLUMN     "stockReservationExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "orders_courierConsignmentId_key" ON "orders"("courierConsignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_courierTrackingCode_key" ON "orders"("courierTrackingCode");

-- CreateIndex
CREATE INDEX "orders_stockReservationExpiresAt_status_idx" ON "orders"("stockReservationExpiresAt", "status");
