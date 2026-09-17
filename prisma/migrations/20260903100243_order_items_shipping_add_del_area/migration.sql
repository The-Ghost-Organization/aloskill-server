-- CreateEnum
CREATE TYPE "DeliveryArea" AS ENUM ('INSIDE_DHAKA', 'OUTSIDE_DHAKA');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "shipping_addresses" ADD COLUMN     "deliveryArea" "DeliveryArea";
