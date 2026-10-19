/*
  Warnings:

  - A unique constraint covering the columns `[requestKey]` on the table `payouts` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PlatformFeeType" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "FinancialEntryKind" AS ENUM ('SALE', 'REFUND');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('PENDING', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "PayoutWorkflowStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "books" ADD COLUMN     "commissionApprovedAt" TIMESTAMP(3),
ADD COLUMN     "commissionRate" DECIMAL(5,2),
ADD COLUMN     "commissionSource" TEXT;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "commissionApprovedAt" TIMESTAMP(3),
ADD COLUMN     "commissionRate" DECIMAL(5,2),
ADD COLUMN     "commissionSource" TEXT;

-- AlterTable
ALTER TABLE "instructor_profiles" ADD COLUMN     "bookCommissionRate" DECIMAL(5,2),
ADD COLUMN     "courseCommissionRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "financeSettledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payout_methods" ADD COLUMN     "accountLastFour" TEXT,
ADD COLUMN     "encryptedAccount" TEXT;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "accountLastFour" TEXT,
ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "encryptedAccountSnapshot" TEXT,
ADD COLUMN     "methodId" TEXT,
ADD COLUMN     "methodType" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "requestKey" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "transactionReference" TEXT,
ADD COLUMN     "workflowStatus" "PayoutWorkflowStatus",
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "fee" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "coursePlatformFeeType" "PlatformFeeType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "coursePlatformFeeValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "financeActivatedAt" TIMESTAMP(3),
ADD COLUMN     "globalBookCommission" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "globalCourseCommission" DECIMAL(5,2) NOT NULL DEFAULT 20,
ADD COLUMN     "holdingPeriodDays" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "minimumPayout" DECIMAL(15,2) NOT NULL DEFAULT 500;

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" TEXT NOT NULL,
    "kind" "FinancialEntryKind" NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "instructorId" TEXT,
    "productId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "grossAmount" DECIMAL(15,2) NOT NULL,
    "discountAmount" DECIMAL(15,2) NOT NULL,
    "netSaleAmount" DECIMAL(15,2) NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL,
    "commissionSource" TEXT NOT NULL,
    "commissionAmount" DECIMAL(15,2) NOT NULL,
    "platformFeeType" "PlatformFeeType" NOT NULL,
    "platformFeeValue" DECIMAL(15,2) NOT NULL,
    "platformFeeAmount" DECIMAL(15,2) NOT NULL,
    "instructorEarning" DECIMAL(15,2) NOT NULL,
    "platformRevenue" DECIMAL(15,2) NOT NULL,
    "holdingPeriodDays" INTEGER NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "reversalOfId" TEXT,
    "refundReference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_items" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "earningId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_reversalOfId_key" ON "financial_entries"("reversalOfId");

-- CreateIndex
CREATE INDEX "financial_entries_instructorId_status_availableAt_idx" ON "financial_entries"("instructorId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "financial_entries_createdAt_productType_kind_idx" ON "financial_entries"("createdAt", "productType", "kind");

-- CreateIndex
CREATE INDEX "financial_entries_orderId_idx" ON "financial_entries"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_orderItemId_kind_key" ON "financial_entries"("orderItemId", "kind");

-- CreateIndex
CREATE INDEX "payout_items_earningId_idx" ON "payout_items"("earningId");

-- CreateIndex
CREATE UNIQUE INDEX "payout_items_payoutId_earningId_key" ON "payout_items"("payoutId", "earningId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_requestKey_key" ON "payouts"("requestKey");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "payout_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "financial_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_earningId_fkey" FOREIGN KEY ("earningId") REFERENCES "financial_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
