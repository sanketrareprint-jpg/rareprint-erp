-- CreateEnum
CREATE TYPE "OrderProductionStage" AS ENUM ('NOT_PRINTED', 'PRINTING', 'PROCESSING', 'READY_FOR_DISPATCH');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "productionStage" "OrderProductionStage" NOT NULL DEFAULT 'NOT_PRINTED';
