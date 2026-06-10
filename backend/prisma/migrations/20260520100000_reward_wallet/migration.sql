-- CreateTable: RewardWallet
CREATE TABLE "RewardWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: userId unique
CREATE UNIQUE INDEX "RewardWallet_userId_key" ON "RewardWallet"("userId");

-- CreateTable: RewardTransaction
CREATE TABLE "RewardTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "notificationId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: walletId
CREATE INDEX "RewardTransaction_walletId_idx" ON "RewardTransaction"("walletId");

-- AddForeignKey: RewardTransaction → RewardWallet
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "RewardWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
